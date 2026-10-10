import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

// 1. サンプルCSV生成 (マイナンバー、電話、メール、氏名、住所、生年月日)
const sampleCsv = `社員番号,氏名,フリガナ,マイナンバー,電話番号,メールアドレス,郵便番号,現住所,生年月日,基本給
EMP-001,佐藤 健一,サトウ ケンイチ,123456789012,090-1234-5678,sato.kenichi@example.com,100-0001,東京都千代田区千代田1-1,1988/05/12,"350,000"
EMP-002,鈴木 美咲,スズキ ミサキ,987654321098,080-9876-5432,suzuki.m@example.jp,150-0043,東京都渋谷区道玄坂2-3-4,1992/11/03,"290,000"
EMP-003,高橋 翔太,タカハシ ショウタ,112233445566,03-3456-7890,takahashi.shota@example.com,530-0001,大阪府大阪市北区梅田1-2,1985/02/20,"420,000"
EMP-004,田中 裕子,タナカ ユウコ,554433221100,070-1111-2222,yuko.tanaka@example.co.jp,460-0008,愛知県名古屋市中区栄3-5,1995/08/19,"260,000"
EMP-005,渡辺 慎太郎,ワタナベ シンタロウ,998877665544,06-6123-4567,watanabe_s@example.org,810-0001,福岡県福岡市中央区天神2-1,1980/12/30,"510,000"
`;

fs.writeFileSync(path.join(publicDir, 'sample_employees.csv'), sampleCsv, 'utf-8');
console.log('Created sample_employees.csv');

// 2. サンプル給与明細PDF (プレーン版) を作成
async function createPlainPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('CONFIDENTIAL: PAYSLIP & TAX REPORT', {
    x: 50,
    y: 780,
    size: 20,
    font: font,
    color: rgb(0.1, 0.1, 0.2),
  });

  page.drawText('Period: 2026-10 | Issued Date: 2026-10-25', {
    x: 50,
    y: 755,
    size: 11,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  // 枠線
  page.drawRectangle({
    x: 50,
    y: 520,
    width: 495,
    height: 210,
    borderColor: rgb(0.2, 0.3, 0.4),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });

  page.drawText('Employee Information', {
    x: 65,
    y: 705,
    size: 13,
    font: font,
    color: rgb(0.1, 0.2, 0.4),
  });

  page.drawText('Employee ID: EMP-2026-0891', { x: 65, y: 680, size: 10, font: regularFont });
  page.drawText('Employee Name: Taro Yamada (SAMPLE)', { x: 65, y: 660, size: 10, font: regularFont });
  page.drawText('Department: Advanced Technology Dept.', { x: 65, y: 640, size: 10, font: regularFont });
  page.drawText('MyNumber (Individual Number): 1234-5678-9012', { x: 65, y: 620, size: 10, font: regularFont });

  page.drawText('Payment & Deduction Breakdown', {
    x: 65,
    y: 585,
    size: 13,
    font: font,
    color: rgb(0.1, 0.2, 0.4),
  });

  page.drawText('Base Salary: JPY 450,000', { x: 65, y: 560, size: 10, font: regularFont });
  page.drawText('Overtime Allowance: JPY 48,500', { x: 65, y: 540, size: 10, font: regularFont });
  page.drawText('Social Insurance: -JPY 72,300', { x: 300, y: 560, size: 10, font: regularFont });
  page.drawText('Income Tax: -JPY 18,200', { x: 300, y: 540, size: 10, font: regularFont });

  // 注意書き
  page.drawText('* This is a mock confidential payslip generated for ZeroLeak Tools test verification.', {
    x: 50,
    y: 490,
    size: 9,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('Password for encryption test is: test2026', {
    x: 50,
    y: 470,
    size: 10,
    font: font,
    color: rgb(0.8, 0.1, 0.1),
  });

  const pdfBytes = await pdfDoc.save();
  const plainPdfPath = path.join(publicDir, 'sample_payslip_plain.pdf');
  fs.writeFileSync(plainPdfPath, pdfBytes);
  console.log('Created sample_payslip_plain.pdf');
}

createPlainPdf();
