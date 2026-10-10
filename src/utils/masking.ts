/**
 * クライアントサイド完結型 マスキング・伏字化ユーティリティ
 * 外部通信0バイト・純粋JavaScript/TypeScript処理
 */

export interface MaskOptions {
  maskMyNumber: boolean;      // マイナンバー (12桁)
  maskPhone: boolean;         // 電話番号 (携帯/固定)
  maskEmail: boolean;         // メールアドレス
  maskPostal: boolean;        // 郵便番号
  maskCreditCard: boolean;    // クレジットカード番号
  replacementType: 'asterisk' | 'tag'; // '***' または '[伏字:種別]'
}

export const DEFAULT_MASK_OPTIONS: MaskOptions = {
  maskMyNumber: true,
  maskPhone: true,
  maskEmail: true,
  maskPostal: true,
  maskCreditCard: true,
  replacementType: 'asterisk',
};

// マイナンバー検査 (チェックデジット検証用または12桁検出)
export function maskMyNumber(text: string, type: 'asterisk' | 'tag'): string {
  // 12桁の連続数字、または 4-4-4 形式
  const regex = /\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b/g;
  return text.replace(regex, (match) => {
    return type === 'asterisk' ? '****-****-****' : '[マイナンバー伏字]';
  });
}

// 電話番号検出 (日本の固定・携帯電話)
export function maskPhone(text: string, type: 'asterisk' | 'tag'): string {
  // 090-1234-5678, 03-1234-5678, 0120-123-456, ハイフンなし10-11桁 (0から始まる)
  const regexHyphen = /\b(0\d{1,4})-(\d{1,4})-(\d{3,4})\b/g;
  let res = text.replace(regexHyphen, (match, p1, p2, p3) => {
    return type === 'asterisk' ? `${p1}-****-${p3}` : '[電話番号伏字]';
  });

  const regexNoHyphen = /\b(0[789]0\d{8}|0\d{9})\b/g;
  res = res.replace(regexNoHyphen, (match) => {
    if (type === 'asterisk') {
      return match.substring(0, 3) + '****' + match.substring(match.length - 4);
    }
    return '[電話番号伏字]';
  });

  return res;
}

// メールアドレス検出
export function maskEmail(text: string, type: 'asterisk' | 'tag'): string {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return text.replace(regex, (match) => {
    if (type === 'tag') return '[メール伏字]';
    const parts = match.split('@');
    const local = parts[0];
    const domain = parts[1];
    const maskedLocal = local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***';
    return `${maskedLocal}@${domain}`;
  });
}

// 郵便番号検出 (123-4567, 1234567)
export function maskPostal(text: string, type: 'asterisk' | 'tag'): string {
  const regex = /\b〒?(\d{3})[- ]?(\d{4})\b/g;
  return text.replace(regex, (match, p1, p2) => {
    return type === 'asterisk' ? `${p1}-****` : '[郵便番号伏字]';
  });
}

// クレジットカード検出 (14-16桁)
export function maskCreditCard(text: string, type: 'asterisk' | 'tag'): string {
  const regex = /\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b/g;
  return text.replace(regex, (match, p1, p2, p3, p4) => {
    return type === 'asterisk' ? `****-****-****-${p4}` : '[カード番号伏字]';
  });
}

/**
 * 汎用テキストに対する一括自動マスキング
 */
export function maskTextContent(text: string, options: MaskOptions = DEFAULT_MASK_OPTIONS): string {
  let result = text;
  if (options.maskCreditCard) result = maskCreditCard(result, options.replacementType);
  if (options.maskMyNumber) result = maskMyNumber(result, options.replacementType);
  if (options.maskPhone) result = maskPhone(result, options.replacementType);
  if (options.maskEmail) result = maskEmail(result, options.replacementType);
  if (options.maskPostal) result = maskPostal(result, options.replacementType);
  return result;
}

/**
 * CSV行データの特定カラム一括マスキング判定
 * ヘッダー名から個人情報カラムを推測
 */
export function isPersonalInfoColumn(headerName: string): boolean {
  const clean = headerName.toLowerCase().trim();
  const keywords = [
    '氏名', '名前', 'name', 'フリガナ', 'カナ', 'kana',
    '電話', 'tel', 'phone', '携帯', 'mobile',
    'メール', 'mail', 'email',
    '住所', 'address', '番地',
    'マイナンバー', 'my_number', '個人番号',
    '生年月日', 'birthday', 'birth', '年齢', 'age',
    '年収', '給与', 'salary', '口座', 'account', 'カード', 'card'
  ];
  return keywords.some(k => clean.includes(k));
}
