// 機密PDF 不可逆黒塗り・墨消し（Redaction）エンジン
// 外部通信0バイト・ブラウザ内Canvasラスタライズによる完全テキスト層消滅

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';

export interface RedactionBox {
  pageNumber: number;      // 1-indexed
  x: number;               // 比率座標 (0.0〜1.0)
  y: number;               // 比率座標 (0.0〜1.0)
  width: number;           // 比率 (0.0〜1.0)
  height: number;          // 比率 (0.0〜1.0)
  textPreview?: string;    // 検出された下の文字（警告表示用）
}

export interface DetectedLeakRisk {
  pageNumber: number;
  text: string;
  box: { x: number; y: number; width: number; height: number };
  type: 'mynumber' | 'phone' | 'email' | 'keyword' | 'annotation';
}

export interface PdfAnalysisResult {
  numPages: number;
  title?: string;
  author?: string;
  detectedRisks: DetectedLeakRisk[];
}

/**
 * PDF内のテキストレイヤーから機密パターン（マイナンバー・電話・メール）の位置を自動検出
 */
export async function analyzePdfRisks(
  pdfBytes: Uint8Array,
  customKeywords: string[] = []
): Promise<PdfAnalysisResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const detectedRisks: DetectedLeakRisk[] = [];

  // メタデータ確認
  let title = '';
  let author = '';
  try {
    const meta = await pdfDoc.getMetadata();
    const info = (meta?.info as any) || {};
    title = info.Title || '';
    author = info.Author || '';
  } catch {}

  const myNumberRegex = /\b\d{4}[- ]?\d{4}[- ]?\d{4}\b/;
  const phoneRegex = /\b0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}\b/;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.transform) continue;
      const str = item.str.trim();
      if (!str) continue;

      let riskType: DetectedLeakRisk['type'] | null = null;
      if (myNumberRegex.test(str)) riskType = 'mynumber';
      else if (phoneRegex.test(str)) riskType = 'phone';
      else if (emailRegex.test(str)) riskType = 'email';
      else if (customKeywords.some((kw) => kw && str.includes(kw))) riskType = 'keyword';

      if (riskType) {
        // PDF座標系から比率座標へ正規化 (PDF原点は左下、Webは左上)
        const [scaleX, , , scaleY, tx, ty] = item.transform;
        const width = item.width || Math.abs(scaleX) * str.length * 0.6;
        const height = item.height || Math.abs(scaleY);

        const nx = Math.max(0, Math.min(1, tx / viewport.width));
        const ny = Math.max(0, Math.min(1, (viewport.height - ty - height) / viewport.height));
        const nw = Math.min(1 - nx, width / viewport.width);
        const nh = Math.min(1 - ny, (height * 1.2) / viewport.height);

        detectedRisks.push({
          pageNumber: pageNum,
          text: str,
          type: riskType,
          box: { x: nx, y: ny, width: nw, height: nh },
        });
      }
    }
  }

  return { numPages, title, author, detectedRisks };
}

/**
 * 矩形黒塗り領域を適用し、Canvasラスタライズでテキスト層を完全消滅させた不可逆PDFを生成
 */
export async function renderRedactedPdf(
  pdfBytes: Uint8Array,
  redactions: RedactionBox[],
  options: {
    dpiScale?: number;     // 画質スケール (2.5〜3.0で約200〜300DPI相当)
    jpegQuality?: number;  // 圧縮品質 (0.85〜0.92)
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<{ pdfBytes: Uint8Array; totalRedactionsApplied: number }> {
  const dpiScale = options.dpiScale || 2.5; // メモリ消費と鮮明度のバランス
  const jpegQuality = options.jpegQuality || 0.90;

  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // 新しいクリーンなPDFDocumentを作成
  const outputPdfDoc = await PDFDocument.create();

  // 内部プロパティを完全消去
  outputPdfDoc.setTitle('');
  outputPdfDoc.setAuthor('');
  outputPdfDoc.setSubject('');
  outputPdfDoc.setKeywords([]);
  outputPdfDoc.setProducer('ZeroLeak Tools (Local Browser Engine)');
  outputPdfDoc.setCreator('ZeroLeak PDF Redactor');

  let appliedCount = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (options.onProgress) {
      options.onProgress(pageNum, numPages);
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: dpiScale });

    // オフスクリーンCanvasで高精細レンダリング
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // 背景を白で初期化
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // PDFページを描画
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      intent: 'print',
    }).promise;

    // このページの黒塗り領域をCanvas上で上書き
    const pageRedactions = redactions.filter((r) => r.pageNumber === pageNum);
    for (const r of pageRedactions) {
      const rx = Math.floor(r.x * canvas.width);
      const ry = Math.floor(r.y * canvas.height);
      const rw = Math.ceil(r.width * canvas.width);
      const rh = Math.ceil(r.height * canvas.height);

      // ピクセルを完全な漆黒 (#000000) で塗り潰す（画素破壊）
      ctx.fillStyle = '#000000';
      ctx.fillRect(rx, ry, rw, rh);
      appliedCount++;
    }

    // CanvasからJPEG画像データを取得（テキスト情報は物理的に消滅）
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const base64Data = dataUrl.split(',')[1];
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // pdf-lib のページへ画像として埋め込み
    const embeddedImage = await outputPdfDoc.embedJpg(imageBytes);
    // 元のページサイズ（pt単位）でページを作成
    const origViewport = page.getViewport({ scale: 1.0 });
    const newPage = outputPdfDoc.addPage([origViewport.width, origViewport.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
  }

  const resultBytes = await outputPdfDoc.save();
  return {
    pdfBytes: resultBytes,
    totalRedactionsApplied: appliedCount,
  };
}

/**
 * テスト・検証用：合成機密PDFの生成ヘルパー
 */
export async function generateSampleConfidentialPdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Confidential Executive Report 2026');
  pdfDoc.setAuthor('Secret Author (admin@internal.local)');

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { StandardFonts, rgb } = await import('pdf-lib');
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('CONFIDENTIAL BOARD MEETING REPORT', {
    x: 50,
    y: 780,
    size: 16,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('Officer: Kentaro Sato (CEO)', { x: 50, y: 740, size: 12, font });
  page.drawText('MyNumber: 1234-5678-9012', { x: 50, y: 710, size: 12, font });
  page.drawText('Contact Direct: 090-1234-5678', { x: 50, y: 680, size: 12, font });
  page.drawText('Email: k.sato@next-frontier.co.jp', { x: 50, y: 650, size: 12, font });
  page.drawText('Bank Account: First Central Bank #9876543 (Confidential)', { x: 50, y: 620, size: 12, font });
  page.drawText('Acquisition Target: Project-Chronos (Estimated: 850,000,000 JPY)', { x: 50, y: 590, size: 12, font });

  // 擬似的な「見た目だけ黒塗り」（四角形を上に重ねただけ）を描画
  page.drawRectangle({
    x: 48,
    y: 706,
    width: 220,
    height: 18,
    color: rgb(0, 0, 0), // 黒い矩形を乗せただけ
  });

  return await pdfDoc.save();
}
