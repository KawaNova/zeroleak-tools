"""
scripts/encrypt_sample_pdf.py — テスト用パスワード暗号化PDFを生成
"""

from pathlib import Path
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"
INPUT_PDF = PUBLIC_DIR / "sample_payslip_plain.pdf"
OUTPUT_PDF = PUBLIC_DIR / "sample_payslip_protected.pdf"

PASSWORD = "test2026"


def main():
    if not INPUT_PDF.exists():
        print(f"Error: {INPUT_PDF} not found")
        return 1

    reader = PdfReader(str(INPUT_PDF))
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    # 128-bit AES暗号化でパスワード設定 (一般的な給与明細PDF仕様)
    writer.encrypt(user_password=PASSWORD, owner_password=PASSWORD, use_128bit=True)

    with open(OUTPUT_PDF, "wb") as f:
        writer.write(f)

    print(f"Successfully generated password-protected PDF: {OUTPUT_PDF} (Password: {PASSWORD})")
    return 0


if __name__ == "__main__":
    main()
