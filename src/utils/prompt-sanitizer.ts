// src/utils/prompt-sanitizer.ts
// ブラウザ内完結（外部送信0バイト）の生成AIプロンプト機密仮名化（トークン置換）＆ワンクリック実名復元ユーティリティ

export type EntityCategory =
  | 'COMPANY'
  | 'PERSON'
  | 'EMAIL'
  | 'PHONE'
  | 'SECRET'
  | 'ID_NUM'
  | 'URL_IP'
  | 'AMOUNT'
  | 'CUSTOM';

export interface ReplacementEntry {
  token: string;        // 例: "{{COMPANY_A}}"
  original: string;     // 例: "株式会社クロスエッジ"
  category: EntityCategory;
  count: number;
}

export interface SanitizeOptions {
  maskCompany: boolean;     // 法人名（株式会社〇〇、〇〇銀行など）
  maskEmail: boolean;       // メールアドレス
  maskPhone: boolean;       // 電話番号
  maskSecretKey: boolean;   // APIキー・Bearerトークン・AWSキー等
  maskMyNumberCard: boolean;// マイナンバー・クレカ番号
  maskUrlIp: boolean;       // 社内URL・プライベートIP
  maskAmount: boolean;      // 金額（〇〇円、¥〇〇）
  customWords: string[];    // ユーザー指定の固有名詞（人名・プロジェクト名など）
}

export const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  maskCompany: true,
  maskEmail: true,
  maskPhone: true,
  maskSecretKey: true,
  maskMyNumberCard: true,
  maskUrlIp: true,
  maskAmount: false,
  customWords: [],
};

const ALPHA_INDEX = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function makeIndexLabel(idx: number): string {
  if (idx < 26) return ALPHA_INDEX[idx];
  const first = Math.floor(idx / 26) - 1;
  const second = idx % 26;
  return `${ALPHA_INDEX[first] || 'Z'}${ALPHA_INDEX[second]}`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * テキスト内の機密情報・固有名詞を検出し、一貫したプレースホルダー（{{COMPANY_A}} 等）へ置換するとともに、
 * AI回答から元の固有名詞へ戻すための対照表（ReplacementEntry[]）を返す
 */
export function sanitizePromptText(
  inputText: string,
  options: SanitizeOptions = DEFAULT_SANITIZE_OPTIONS
): {
  sanitizedText: string;
  entries: ReplacementEntry[];
  totalReplacedCount: number;
} {
  let workingText = inputText;
  const entries: ReplacementEntry[] = [];
  const originalToToken = new Map<string, ReplacementEntry>();
  const categoryCounters: Record<EntityCategory, number> = {
    COMPANY: 0,
    PERSON: 0,
    EMAIL: 0,
    PHONE: 0,
    SECRET: 0,
    ID_NUM: 0,
    URL_IP: 0,
    AMOUNT: 0,
    CUSTOM: 0,
  };

  const registerAndReplace = (rawMatch: string, category: EntityCategory) => {
    const trimmed = rawMatch.trim();
    if (!trimmed || trimmed.length < 2) return;
    // 既にプレースホルダー化されている文字列はスキップ
    if (/^\{\{[A-Z_]+_[A-Z]+\}\}$/.test(trimmed)) return;

    let entry = originalToToken.get(trimmed);
    if (!entry) {
      const idx = categoryCounters[category]++;
      const suffix = makeIndexLabel(idx);
      const token = `{{${category}_${suffix}}}`;
      entry = {
        token,
        original: trimmed,
        category,
        count: 0,
      };
      originalToToken.set(trimmed, entry);
      entries.push(entry);
    }

    const pattern = new RegExp(escapeRegExp(trimmed), 'g');
    const matches = workingText.match(pattern);
    if (matches && matches.length > 0) {
      entry.count += matches.length;
      workingText = workingText.replace(pattern, entry.token);
    }
  };

  // 1. ユーザー指定のカスタム固有名詞（長い順にソートして部分一致崩壊を防止）
  const validCustom = options.customWords
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const word of validCustom) {
    if (workingText.includes(word)) {
      registerAndReplace(word, 'CUSTOM');
    }
  }

  // 2. APIキー・シークレットトークン (sk-..., ghp_..., AKIA..., xoxb-..., Bearer ...)
  if (options.maskSecretKey) {
    const secretRegex =
      /\b(?:sec_(?:live|test)_[0-9a-zA-Z_]{10,}|sk-[0-9a-zA-Z]{16,}|api_key_[0-9a-zA-Z_]{10,}|xox[baprs]-[0-9a-zA-Z-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{30,})\b/g;
    const found = workingText.match(secretRegex) || [];
    for (const m of found) registerAndReplace(m, 'SECRET');
  }

  // 3. URL・プライベートIPアドレス
  if (options.maskUrlIp) {
    const urlRegex = /https?:\/\/[^\s"'<>)\]]+/g;
    const foundUrls = workingText.match(urlRegex) || [];
    for (const m of foundUrls) registerAndReplace(m, 'URL_IP');

    const ipRegex = /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g;
    const foundIps = workingText.match(ipRegex) || [];
    for (const m of foundIps) registerAndReplace(m, 'URL_IP');
  }

  // 4. メールアドレス
  if (options.maskEmail) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const found = workingText.match(emailRegex) || [];
    for (const m of found) registerAndReplace(m, 'EMAIL');
  }

  // 5. クレジットカード ＆ マイナンバー（12桁〜16桁）
  if (options.maskMyNumberCard) {
    const cardRegex = /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g;
    const foundCards = workingText.match(cardRegex) || [];
    for (const m of foundCards) registerAndReplace(m, 'ID_NUM');

    const myNumRegex = /\b\d{4}[- ]?\d{4}[- ]?\d{4}\b/g;
    const foundMyNum = workingText.match(myNumRegex) || [];
    for (const m of foundMyNum) registerAndReplace(m, 'ID_NUM');
  }

  // 6. 電話番号（固定・携帯・フリーダイヤル）
  if (options.maskPhone) {
    const phoneRegex = /\b0\d{1,4}-\d{1,4}-\d{3,4}\b|\b0[789]0\d{8}\b/g;
    const found = workingText.match(phoneRegex) || [];
    for (const m of found) registerAndReplace(m, 'PHONE');
  }

  // 7. 法人名（株式会社〇〇、〇〇株式会社、合同会社〇〇、〇〇銀行など）
  if (options.maskCompany) {
    const corpRegex =
      /(?:株式会社|合同会社|有限会社|医療法人|社会福祉法人)[一-龠ァ-ヶーa-zA-Z0-9・]{2,20}|[一-龠ァ-ヶーa-zA-Z0-9・]{2,20}(?:株式会社|合同会社|有限会社|銀行|信用金庫|証券)/g;
    const found = workingText.match(corpRegex) || [];
    // 長い法人名から優先置換
    const sorted = [...new Set(found)].sort((a, b) => b.length - a.length);
    for (const m of sorted) registerAndReplace(m, 'COMPANY');
  }

  // 8. 金額表現（オプション）
  if (options.maskAmount) {
    const amountRegex = /(?:¥|￥)\s?\d{1,3}(?:,\d{3})+|\b\d{1,4}(?:,\d{3})+(?:円|万円|億円)\b|\b\d+(?:万円|億円)\b/g;
    const found = workingText.match(amountRegex) || [];
    const sorted = [...new Set(found)].sort((a, b) => b.length - a.length);
    for (const m of sorted) registerAndReplace(m, 'AMOUNT');
  }

  const totalReplacedCount = entries.reduce((sum, e) => sum + e.count, 0);

  return {
    sanitizedText: workingText,
    entries,
    totalReplacedCount,
  };
}

/**
 * AI（ChatGPT / Claude / Copilot等）が返したテキスト内のプレースホルダー（{{COMPANY_A}} 等）を
 * ブラウザ内メモリ上の対照表を使って元の実名へ一括復元する
 */
export function restoreOriginalText(
  aiResponseText: string,
  entries: ReplacementEntry[]
): {
  restoredText: string;
  restoredTokenCount: number;
} {
  let output = aiResponseText;
  let restoredTokenCount = 0;

  for (const entry of entries) {
    const pattern = new RegExp(escapeRegExp(entry.token), 'g');
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      restoredTokenCount += matches.length;
      output = output.replace(pattern, entry.original);
    }
  }

  return {
    restoredText: output,
    restoredTokenCount,
  };
}

/**
 * ワンクリック動作検証用：社外秘の契約交渉メール＆障害ログを含むサンプルプロンプト
 */
export const SAMPLE_AI_PROMPT = `以下の社外秘議事録を要約し、先方への返信メール案を作成してください。

【商談記録】
・取引先：株式会社ネクストフロンティア（担当：佐藤 健太郎 様 / 鈴木 一郎 様）
・決済銀行：第一中央銀行 本店営業部
・先方連絡先：k.sato@next-frontier.co.jp / 直通電話：090-1234-5678
・プロジェクト名：Project-Chronos（次世代決済基盤移行）
・予算上限：月額 4,850,000円（初期費用 1,200万円）
・検証環境URL：https://staging-chronos.internal-corp.local/admin?tenant=nf_001
・本番APIキー：sec_live_sample_token_9876543210
・マイナンバー管理番号：1234-5678-9012

【依頼事項】
株式会社ネクストフロンティアの佐藤 健太郎様宛に、Project-Chronosの初期費用とスケジュール合意のお礼メールを下書きしてください。`;

export const SAMPLE_CUSTOM_WORDS = ['佐藤 健太郎', '鈴木 一郎', 'Project-Chronos'];
