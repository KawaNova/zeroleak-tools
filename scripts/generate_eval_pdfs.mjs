import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const evalPdfDir = path.join(root, 'evaluation/pdf');

async function createEvaluationPdfs() {
  // 1. 給与明細原本
  const payslipDoc = await PDFDocument.create();
  const page1 = payslipDoc.addPage([595.28, 841.89]);
  const fontBold = await payslipDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await payslipDoc.embedFont(StandardFonts.Helvetica);

  page1.drawText('CONFIDENTIAL: PAYSLIP & SALARY STATEMENT', {
    x: 50, y: 780, size: 18, font: fontBold, color: rgb(0.1, 0.2, 0.4)
  });
  page1.drawText('Target Month: 2026-10 | Issued: 2026-10-25', {
    x: 50, y: 755, size: 10, font: fontReg, color: rgb(0.4, 0.4, 0.4)
  });
  page1.drawRectangle({
    x: 50, y: 530, width: 495, height: 200,
    borderColor: rgb(0.3, 0.4, 0.5), borderWidth: 1, color: rgb(0.98, 0.98, 0.99)
  });
  page1.drawText('Employee: Taro Yamada (ID: EMP-001)', { x: 65, y: 700, size: 12, font: fontBold });
  page1.drawText('MyNumber: 1234-5678-9012', { x: 65, y: 680, size: 10, font: fontReg });
  page1.drawText('Base Salary: JPY 450,000', { x: 65, y: 650, size: 11, font: fontReg });
  page1.drawText('Overtime Pay: JPY 48,500', { x: 65, y: 630, size: 11, font: fontReg });
  page1.drawText('Social Insurance: -JPY 72,300', { x: 300, y: 650, size: 11, font: fontReg });
  page1.drawText('Income Tax: -JPY 18,200', { x: 300, y: 630, size: 11, font: fontReg });
  page1.drawText('Net Payment: JPY 408,000', { x: 65, y: 590, size: 13, font: fontBold, color: rgb(0.1, 0.5, 0.2) });
  page1.drawText('Password for this test PDF: test2026', { x: 50, y: 490, size: 11, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  const plainPayslipBytes = await payslipDoc.save();
  const plainPayslipPath = path.join(evalPdfDir, '00_plain_reference.pdf');
  fs.writeFileSync(plainPayslipPath, plainPayslipBytes);

  // 2. 源泉徴収票原本
  const gensenDoc = await PDFDocument.create();
  const gPage = gensenDoc.addPage([595.28, 841.89]);
  gPage.drawText('ANNUAL WITHHOLDING TAX SLIP (SAMPLE)', {
    x: 50, y: 780, size: 18, font: fontBold, color: rgb(0.1, 0.2, 0.4)
  });
  gPage.drawText('Tax Year: 2026 | National Tax Agency Format', {
    x: 50, y: 755, size: 10, font: fontReg, color: rgb(0.4, 0.4, 0.4)
  });
  gPage.drawRectangle({
    x: 50, y: 500, width: 495, height: 230,
    borderColor: rgb(0.3, 0.4, 0.5), borderWidth: 1, color: rgb(0.98, 0.99, 0.98)
  });
  gPage.drawText('Taxpayer: Hanako Suzuki (ID: TAX-2026-99)', { x: 65, y: 700, size: 12, font: fontBold });
  gPage.drawText('Individual Number (MyNumber): 9876-5432-1098', { x: 65, y: 680, size: 10, font: fontReg });
  gPage.drawText('Gross Income: JPY 6,250,000', { x: 65, y: 640, size: 12, font: fontBold });
  gPage.drawText('Employment Income Deduction: JPY 1,740,000', { x: 65, y: 620, size: 10, font: fontReg });
  gPage.drawText('Social Insurance Deduction: JPY 890,000', { x: 65, y: 600, size: 10, font: fontReg });
  gPage.drawText('Withholding Tax Amount: JPY 142,500', { x: 65, y: 560, size: 13, font: fontBold, color: rgb(0.1, 0.5, 0.2) });
  gPage.drawText('Password for this test PDF: gensen2026', { x: 50, y: 460, size: 11, font: fontBold, color: rgb(0.8, 0.1, 0.1) });

  const plainGensenBytes = await gensenDoc.save();
  const plainGensenPath = path.join(evalPdfDir, 'temp_gensen_plain.pdf');
  fs.writeFileSync(plainGensenPath, plainGensenBytes);

  console.log('Plain PDFs created.');
}

createEvaluationPdfs();
