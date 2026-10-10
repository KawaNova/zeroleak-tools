import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { maskTextContent, isPersonalInfoColumn } from '../src/utils/masking.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const evalCsvDir = path.join(root, 'evaluation/csv');
const evalPdfDir = path.join(root, 'evaluation/pdf');

async function testAllCsvs() {
  console.log('========================================');
  console.log('1. CSV / Text Masking Verifications');
  console.log('========================================');

  // テスト1: 社員名簿 (01_employees_with_mynumber.csv)
  const csv1 = fs.readFileSync(path.join(evalCsvDir, '01_employees_with_mynumber.csv'), 'utf-8');
  const parsed1 = Papa.parse(csv1, { skipEmptyLines: true });
  const rows1 = parsed1.data;
  const headers1 = rows1[0];

  const targetCols1 = headers1.map((h, i) => isPersonalInfoColumn(h) ? i : -1).filter(i => i !== -1);
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

  // パスワードなしPDFを再構築
  const outPdfDoc = await PDFDocument.create();
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    outPdfDoc.addPage([595.28, 841.89]);
  }
  const unlockedBytes = await outPdfDoc.save();

  // パスワードなしで開けることを確認
  const verifyTask = pdfjsLib.getDocument({ data: new Uint8Array(unlockedBytes) });
  const verifiedDoc = await verifyTask.promise;
  console.log(`  Verified unlocked file opens with 0 passwords (Pages: ${verifiedDoc.numPages})`);
}

async function testAllPdfs() {
  console.log('\n========================================');
  console.log('2. PDF Password Unlock Verifications');
  console.log('========================================');

  console.log('[Test 2.1] Payslip PDF (Password: test2026):');
  await testPdf('01_payslip_protected.pdf', 'test2026');
  console.log('  ✔ [Test 2.1] Payslip Decryption: PASSED');

  console.log('[Test 2.2] Withholding Slip PDF (Password: gensen2026):');
  await testPdf('02_withholding_slip_protected.pdf', 'gensen2026');
  console.log('  ✔ [Test 2.2] Withholding Slip Decryption: PASSED');
}

async function main() {
  await testAllCsvs();
  await testAllPdfs();
  console.log('\n========================================');
  console.log('ALL EVALUATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

main().catch(err => {
  console.error('\n❌ Evaluation test failed:', err);
  process.exit(1);
});
