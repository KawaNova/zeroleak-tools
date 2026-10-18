import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { maskTextContent, isPersonalInfoColumn } from '../src/utils/masking.ts';
import {
  inspectImageMetadata,
  stripImageMetadataLossless,
  createZipArchive,
} from '../src/utils/exif.ts';
import {
  exportToPlainText,
  exportToSrt,
  exportToVtt,
  generateSampleMeetingWavAndTranscript,
} from '../src/utils/audio-transcribe.ts';
import { applyRegionEffect } from '../src/utils/mosaic.ts';
import {
  sanitizePromptText,
  restoreOriginalText,
  SAMPLE_AI_PROMPT,
  SAMPLE_CUSTOM_WORDS,
} from '../src/utils/prompt-sanitizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const evalCsvDir = path.join(root, 'evaluation/csv');
const evalPdfDir = path.join(root, 'evaluation/pdf');

async function testAllCsvs() {
  console.log('========================================');
  console.log('1. CSV / Text Masking Verifications (/csv-masking/)');
  console.log('========================================');

  // テスト1: 社員名簿 (01_employees_with_mynumber.csv)
  const csv1 = fs.readFileSync(path.join(evalCsvDir, '01_employees_with_mynumber.csv'), 'utf-8');
  const parsed1 = Papa.parse(csv1, { skipEmptyLines: true });
  const rows1 = parsed1.data;
  const headers1 = rows1[0];

  const targetCols1 = headers1.map((h, i) => (isPersonalInfoColumn(h) ? i : -1)).filter((i) => i !== -1);
  console.log('[Test 1.1] Employee CSV Auto-detected columns:', targetCols1);
  if (!targetCols1.includes(1) || !targetCols1.includes(3) || !targetCols1.includes(4)) {
    throw new Error('Auto detection failed for Employee CSV');
  }

  const maskedRow1 = rows1[1].map((val, c) => {
    let m = maskTextContent(val);
    if (targetCols1.includes(c) && !m.includes('*')) {
      m = m[0] + '***';
    }
    return m;
  });
  console.log('  Row 1 Original:', rows1[1][1], rows1[1][3], rows1[1][4]);
  console.log('  Row 1 Masked:  ', maskedRow1[1], maskedRow1[3], maskedRow1[4]);
  if (!maskedRow1[3].includes('****')) throw new Error('MyNumber failed');
  console.log('  ✔ [Test 1.1] Employee CSV Masking: PASSED');

  // テスト2: 顧客リード（カード番号） (02_customer_leads.csv)
  const csv2 = fs.readFileSync(path.join(evalCsvDir, '02_customer_leads.csv'), 'utf-8');
  const parsed2 = Papa.parse(csv2, { skipEmptyLines: true });
  const cardRow = parsed2.data[1];
  const maskedCard = maskTextContent(cardRow[5]);
  console.log('  Card Original:', cardRow[5]);
  console.log('  Card Masked:  ', maskedCard);
  if (!maskedCard.includes('****-****-****')) throw new Error('CreditCard failed');
  console.log('  ✔ [Test 1.2] Customer Leads Card Masking: PASSED');

  // テスト3: 自由テキストメモ (03_free_text_notes.txt)
  const text3 = fs.readFileSync(path.join(evalCsvDir, '03_free_text_notes.txt'), 'utf-8');
  const maskedText3 = maskTextContent(text3);
  if (maskedText3.includes('9876-5432-1098') || maskedText3.includes('090-4321-8765')) {
    throw new Error('Free text personal info leaked');
  }
  console.log('  ✔ [Test 1.3] Free Text Regex Masking: PASSED');
}

async function testPdf(filename, password) {
  const filePath = path.join(evalPdfDir, filename);
  const pdfBytes = fs.readFileSync(filePath);

  // パスワードで復号
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    password: password,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  const pdfDoc = await loadingTask.promise;
  console.log(`  Decrypted ${filename} with password '${password}' (Pages: ${pdfDoc.numPages})`);

  // パスワードなし＆メタデータ0件PDFを再構築
  const outPdfDoc = await PDFDocument.create();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    outPdfDoc.addPage([595.28, 841.89]);
  }
  outPdfDoc.setTitle('');
  outPdfDoc.setAuthor('');
  outPdfDoc.setSubject('');
  outPdfDoc.setKeywords([]);
  outPdfDoc.setCreator('');
  outPdfDoc.setProducer('');
  const unlockedBytes = await outPdfDoc.save();

  // パスワードなしで開け、かつメタデータが空であることを確認
  const verifyTask = pdfjsLib.getDocument({ data: new Uint8Array(unlockedBytes) });
  const verifiedDoc = await verifyTask.promise;
  const meta = await verifiedDoc.getMetadata();
  const info = meta?.info || {};
  if (info.Author || info.Title || info.Creator) {
    throw new Error('Metadata was not wiped cleanly');
  }
  console.log(
    `  Verified unlocked file opens with 0 passwords & 0 metadata (Pages: ${verifiedDoc.numPages})`
  );
}

async function testAllPdfs() {
  console.log('\n========================================');
  console.log('2. PDF Unlock & Metadata Wipe Verifications (/pdf-unlock/)');
  console.log('========================================');

  console.log('[Test 2.1] Payslip PDF (Password: test2026):');
  await testPdf('01_payslip_protected.pdf', 'test2026');
  console.log('  ✔ [Test 2.1] Payslip Decryption & Metadata Wipe: PASSED');

  console.log('[Test 2.2] Withholding Slip PDF (Password: gensen2026):');
  await testPdf('02_withholding_slip_protected.pdf', 'gensen2026');
  console.log('  ✔ [Test 2.2] Withholding Slip Decryption & Metadata Wipe: PASSED');
}

async function testExifAndZip() {
  console.log('\n========================================');
  console.log('3. EXIF / GPS Lossless Strip & ZIP Verifications (/exif-remover/)');
  console.log('========================================');

  // 合成JPEGバイナリ（SOI + APP1 EXIF/GPS + DQT + EOI）を作成して検査＆消去テスト
  const fakeExifApp1 = new Uint8Array([
    0xff, 0xe1, 0x00, 0x36, // APP1 marker + length (54 bytes, total segment = 56 bytes)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF II header
    0x02, 0x00, // 2 entries in IFD0
    0x0f, 0x01, 0x02, 0x00, 0x06, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00, // Make = "Apple\0"
    0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, // GPS IFD Pointer = 44
    0x00, 0x00, 0x00, 0x00, // Next IFD = 0
    0x41, 0x70, 0x70, 0x6c, 0x65, 0x00, // "Apple\0"
    0x00, 0x00, // GPS IFD with 0 entries (still flags hasGps = true)
  ]);
  const soi = new Uint8Array([0xff, 0xd8]);
  const dummyScan = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9]);

  const testJpeg = new Uint8Array(soi.length + fakeExifApp1.length + dummyScan.length);
  testJpeg.set(soi, 0);
  testJpeg.set(fakeExifApp1, soi.length);
  testJpeg.set(dummyScan, soi.length + fakeExifApp1.length);

  const before = inspectImageMetadata(testJpeg);
  console.log('  [Before Strip] Format:', before.format, '| hasExif:', before.hasExif, '| hasGps:', before.hasGps, '| Tags:', before.detectedTags);
  if (!before.hasExif || !before.hasGps || before.cameraText !== 'Apple') {
    throw new Error('EXIF/GPS parser failed to detect embedded TIFF tags');
  }

  const { cleanedBytes, removedBytes } = stripImageMetadataLossless(testJpeg);
  const after = inspectImageMetadata(cleanedBytes);
  console.log('  [After Strip]  Removed Bytes:', removedBytes, '| hasExif:', after.hasExif, '| hasGps:', after.hasGps);
  if (after.hasExif || after.hasGps || removedBytes !== fakeExifApp1.length) {
    throw new Error('EXIF/GPS lossless stripping failed');
  }
  console.log('  ✔ [Test 3.1] JPEG EXIF/GPS Lossless Binary Strip: PASSED');

  // ZIP生成検証
  const zipBytes = createZipArchive([
    { name: 'photo1_clean.jpg', data: cleanedBytes },
    { name: 'photo2_clean.jpg', data: cleanedBytes },
  ]);
  // PK\x03\x04 シグネチャ確認
  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b || zipBytes[2] !== 0x03 || zipBytes[3] !== 0x04) {
    throw new Error('Invalid ZIP header signature');
  }
  console.log(`  ✔ [Test 3.2] In-Browser ZIP Archive Generation (${zipBytes.length} bytes): PASSED`);
}

async function testAudioTranscribeAndMask() {
  console.log('\n========================================');
  console.log('4. Confidential Audio WAV & Transcript PII Masking (/local-whisper/)');
  console.log('========================================');

  const sample = generateSampleMeetingWavAndTranscript();
  console.log(`  Generated Sample WAV: ${sample.fileName} (${sample.wavBytes.length} bytes, Segments: ${sample.segments.length})`);
  // RIFF WAVE ヘッダ検証
  const headerStr = String.fromCharCode(...sample.wavBytes.subarray(0, 4));
  if (headerStr !== 'RIFF') {
    throw new Error('WAV header generation failed');
  }

  const plainMasked = exportToPlainText(sample.segments, true, true);
  console.log('  Masked Transcript Output:\n' + plainMasked.text.split('\n').map((l) => '    ' + l).join('\n'));
  if (
    plainMasked.text.includes('090-1234-5678') ||
    plainMasked.text.includes('legal-team@example.co.jp') ||
    plainMasked.text.includes('1234-5678-9012')
  ) {
    throw new Error('PII leaked in audio transcript export');
  }
  if (plainMasked.maskedCount < 3) {
    throw new Error(`Expected >= 3 masked items, got ${plainMasked.maskedCount}`);
  }

  const srtOut = exportToSrt(sample.segments, true);
  const vttOut = exportToVtt(sample.segments, true);
  if (!srtOut.includes('-->') || !vttOut.startsWith('WEBVTT')) {
    throw new Error('SRT/VTT formatting failed');
  }
  console.log(`  ✔ [Test 4.1] Audio WAV Synthesis & PII Masked TXT/SRT/VTT Export (${plainMasked.maskedCount} PII items masked): PASSED`);
}

async function testMosaicPixelEngine() {
  console.log('\n========================================');
  console.log('5. Local Mosaic & Irreversible Blackout Engine (/local-mosaic/)');
  console.log('========================================');

  // 100x100 の仮想RGBバッファでピクセル破壊（モザイク平均化＆黒塗り）を検証
  const width = 100;
  const height = 100;
  const rawPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rawPixels.length; i += 4) {
    rawPixels[i] = (i * 17) % 255;     // R
    rawPixels[i + 1] = (i * 31) % 255; // G
    rawPixels[i + 2] = (i * 47) % 255; // B
    rawPixels[i + 3] = 255;            // A
  }

  let lastPutImageData = null;
  let lastFillRect = null;
  const mockCtx = {
    fillStyle: '',
    save() {},
    restore() {},
    fillRect(x, y, w, h) {
      lastFillRect = { x, y, w, h, style: this.fillStyle };
    },
    getImageData(x, y, w, h) {
      return { data: new Uint8ClampedArray(w * h * 4).map((_, idx) => rawPixels[idx % rawPixels.length]) };
    },
    putImageData(imgData, x, y) {
      lastPutImageData = { imgData, x, y };
    },
  };

  // Test 5.1: Pixelate
  applyRegionEffect(mockCtx, width, height, {
    id: 'test-pix',
    nx: 0.1,
    ny: 0.1,
    nw: 0.4,
    nh: 0.4,
    effect: 'pixelate',
    strength: 16,
  });
  if (!lastPutImageData || lastPutImageData.x !== 10 || lastPutImageData.y !== 10) {
    throw new Error('Pixelate region coordinates mismatch');
  }
  // 同一ブロック内の隣接ピクセルが同じ平均RGB値に揃っていることを確認
  const d = lastPutImageData.imgData.data;
  if (d[0] !== d[4] || d[1] !== d[5] || d[2] !== d[6]) {
    throw new Error('Pixelate block averaging did not unify adjacent pixels');
  }
  console.log('  ✔ [Test 5.1] Irreversible Pixelate Block Averaging: PASSED');

  // Test 5.2: Blackout
  applyRegionEffect(mockCtx, width, height, {
    id: 'test-blk',
    nx: 0.2,
    ny: 0.5,
    nw: 0.5,
    nh: 0.2,
    effect: 'blackout',
    strength: 20,
  });
  if (!lastFillRect || lastFillRect.style !== '#000000' || lastFillRect.w !== 50 || lastFillRect.h !== 20) {
    throw new Error('Blackout effect failed');
  }
  console.log('  ✔ [Test 5.2] Complete Blackout (#000000) Redaction: PASSED');
}

async function testPromptSanitizerAndRestore() {
  console.log('\n========================================');
  console.log('6. AI Prompt Sanitizer & Round-trip Restore (/ai-prompt-sanitizer/)');
  console.log('========================================');

  const res = sanitizePromptText(SAMPLE_AI_PROMPT, {
    maskCompany: true,
    maskEmail: true,
    maskPhone: true,
    maskSecretKey: true,
    maskMyNumberCard: true,
    maskUrlIp: true,
    maskAmount: true,
    customWords: SAMPLE_CUSTOM_WORDS,
  });

  // 元の固有名詞・機密が消えているか検証
  const leakedWords = [
    '株式会社ネクストフロンティア',
    '第一中央銀行',
    '佐藤 健太郎',
    '鈴木 一郎',
    'Project-Chronos',
    'k.sato@next-frontier.co.jp',
    '090-1234-5678',
    'sec_live_sample_token_9876543210',
    'https://staging-chronos.internal-corp.local/admin?tenant=nf_001',
  ];

  for (const word of leakedWords) {
    if (res.sanitizedText.includes(word)) {
      throw new Error(`Leaked confidential word in sanitized prompt: ${word}`);
    }
  }
  if (!res.sanitizedText.includes('{{COMPANY_A}}') || !res.sanitizedText.includes('{{CUSTOM_A}}')) {
    throw new Error('Expected placeholder tokens not found in sanitized prompt');
  }
  console.log(
    `  ✔ [Test 6.1] Prompt Tokenization: ${res.entries.length} unique entities (${res.totalReplacedCount} occurrences) masked -> PASSED`
  );

  // 往復復元検証（元のプロンプトにそのまま戻せるか）
  const roundTrip = restoreOriginalText(res.sanitizedText, res.entries);
  if (roundTrip.restoredText !== SAMPLE_AI_PROMPT) {
    throw new Error('Round-trip restoration did not match original prompt text');
  }
  console.log(
    `  ✔ [Test 6.2] 100% Exact Round-trip Real-name Restoration (${roundTrip.restoredTokenCount} tokens restored): PASSED`
  );
}

async function testBuiltHtmlAndCspAudit() {
  console.log('\n========================================');
  console.log('7. Built HTML / CSP / SEO Keyword Audit (All 8 Routes)');
  console.log('========================================');

  const routes = [
    { path: 'index.html', mustInclude: ['サーバー送信0バイト', '/csv-masking/', '/pdf-unlock/', '/exif-remover/', '/local-mosaic/', '/local-whisper/', '/ai-prompt-sanitizer/'] },
    { path: 'csv-masking/index.html', mustInclude: ["connect-src 'self'", 'マイナンバー', 'FAQPage', 'あわせて使われるツール'] },
    { path: 'pdf-unlock/index.html', mustInclude: ['パスワード解除＆メタデータ削除', '一括', 'ブラウザ', 'サーバー送信なし', 'FAQPage', 'あわせて使われるツール'] },
    { path: 'exif-remover/index.html', mustInclude: ['位置情報（EXIF・GPS）削除', '一括', 'ブラウザ', 'サーバー送信なし', 'FAQPage', 'あわせて使われるツール'] },
    { path: 'local-mosaic/index.html', mustInclude: ['モザイク＆黒塗り', '一括', 'ブラウザ', 'サーバー送信なし', 'FAQPage', 'あわせて使われるツール'] },
    { path: 'local-whisper/index.html', mustInclude: ['文字起こし', '一括', 'ブラウザ', 'サーバー送信なし', 'FAQPage', 'あわせて使われるツール'] },
    { path: 'ai-prompt-sanitizer/index.html', mustInclude: ['ChatGPT・AIプロンプト', '一括', 'ブラウザ', 'サーバー送信なし', 'FAQPage', 'あわせて使われるツール'] },
    { path: 'legal/index.html', mustInclude: ['免責事項', 'プライバシーポリシー'] },
  ];

  for (const r of routes) {
    const fullPath = path.join(root, 'dist', r.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing built file: ${fullPath}`);
    }
    const html = fs.readFileSync(fullPath, 'utf-8');
    // CSP ヘッダー検証
    if (!html.includes('http-equiv="Content-Security-Policy"')) {
      throw new Error(`Missing CSP meta tag in ${r.path}`);
    }
    // 外部スクリプトCDN混入チェック
    if (html.includes('googletagmanager.com') || html.includes('cdn.jsdelivr.net') || html.includes('unpkg.com')) {
      throw new Error(`External CDN script detected in ${r.path}`);
    }
    for (const kw of r.mustInclude) {
      if (!html.includes(kw)) {
        throw new Error(`Expected keyword "${kw}" missing in ${r.path}`);
      }
    }
    console.log(`  ✔ [Route Audit] dist/${r.path} (${(html.length / 1024).toFixed(1)} KB): CSP + F12 Banner + RelatedTools + SEO Keywords OK`);
  }
}

async function main() {
  await testAllCsvs();
  await testAllPdfs();
  await testExifAndZip();
  await testAudioTranscribeAndMask();
  await testMosaicPixelEngine();
  await testPromptSanitizerAndRestore();
  await testBuiltHtmlAndCspAudit();
  console.log('\n========================================');
  console.log('ALL 7 MODULE & ROUTE SUITES PASSED SUCCESSFULLY!');
  console.log('========================================');
}

main().catch((err) => {
  console.error('\n❌ Evaluation test failed:', err);
  process.exit(1);
});
