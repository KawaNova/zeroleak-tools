"""
scripts/encrypt_eval_pdfs.py — 評価用PDFに暗号化パスワードを設定
"""

from pathlib import Path
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent.parent
EVAL_PDF_DIR = ROOT / "evaluation" / "pdf"


def encrypt_file(input_name: str, output_name: str, password: str):
    in_path = EVAL_PDF_DIR / input_name
    out_path = EVAL_PDF_DIR / output_name

    reader = PdfReader(str(in_path))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    writer.encrypt(user_password=password, owner_password=password, use_128bit=True)
    with open(out_path, "wb") as f:
        writer.write(f)

    print(f"Encrypted {output_name} with password '{password}'")


def main():
    # 1. 給与明細
    encrypt_file("00_plain_reference.pdf", "01_payslip_protected.pdf", "test2026")
    # 2. 源泉徴収票
    encrypt_file("temp_gensen_plain.pdf", "02_withholding_slip_protected.pdf", "gensen2026")

    # 一時ファイルのクリーンアップ
    temp_gensen = EVAL_PDF_DIR / "temp_gensen_plain.pdf"
    if temp_gensen.exists():
        temp_gensen.unlink()

    print("All evaluation PDFs generated successfully!")


if __name__ == "__main__":
    main()
