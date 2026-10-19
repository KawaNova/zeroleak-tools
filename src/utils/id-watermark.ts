// 身分証・マイナンバー悪用防止透かし焼き込みエンジン
// 外部通信0バイト・純粋クライアントサイド・HTML5 Canvas処理

export type WatermarkPattern = 'repeat' | 'center' | 'cross';

export interface WatermarkOptions {
  text: string;
  fontSize: number; // 基準フォントサイズ (px)
  opacity: number; // 0.1 〜 0.8
  color: string; // hex or rgba
  angle: number; // 回転角度 (度, e.g. -30)
  pattern: WatermarkPattern;
}

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptions = {
  text: '本人確認 提出用 悪用禁止',
  fontSize: 28,
  opacity: 0.25,
  color: '#475569', // slate-600
  angle: -30,
  pattern: 'repeat',
};

export const WATERMARK_PRESETS = [
  { label: '本人確認（汎用）', text: '本人確認 提出用 悪用禁止' },
  { label: '他目的使用禁止', text: '〇〇提出用 他目的使用厳禁' },
  { label: '会員登録用', text: '会員登録審査用 転載不可' },
  { label: '賃貸入居申込', text: '賃貸入居申込用 悪用禁止' },
  { label: 'アルバイト提出', text: 'バイト採用手続き用 コピー厳禁' },
];

/**
 * Canvasに透かしテキストを描画するコア関数
 */
export function applyWatermarkToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: WatermarkOptions
): void {
  const { text, fontSize, opacity, color, angle, pattern } = options;
  if (!text || text.trim() === '') return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const rad = (angle * Math.PI) / 180;

  if (pattern === 'center') {
    // 中央に1〜2行大きく描画
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);
    ctx.fillText(text, 0, 0);
  } else if (pattern === 'cross') {
    // X字クロス（左上->右下、右上->左下）
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);
    ctx.fillText(text, 0, -fontSize * 0.8);
    ctx.restore();

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-rad);
    ctx.fillText(text, 0, fontSize * 0.8);
    ctx.restore();
  } else {
    // repeat: 斜めリピート格子パターン
    // 回転したグリッドを覆うために対角線長さを算出
    const diag = Math.sqrt(width * width + height * height);
    const stepX = Math.max(fontSize * text.length * 0.75 + 60, 180);
    const stepY = fontSize * 3.5 + 40;

    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    const startX = -diag;
    const endX = diag;
    const startY = -diag;
    const endY = diag;

    let rowIndex = 0;
    for (let y = startY; y <= endY; y += stepY) {
      // 奇数行を千鳥配置（互い違い）にして視認性アップ
      const offsetX = (rowIndex % 2) * (stepX / 2);
      for (let x = startX; x <= endX; x += stepX) {
        ctx.fillText(text, x + offsetX, y);
      }
      rowIndex++;
    }
  }

  ctx.restore();
}

/**
 * 今日の日付文字列（YYYY/MM/DD）を取得
 */
export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/**
 * テスト・検証用：ダミーの運転免許証SVGデータURIを生成
 */
export function generateDummyIdSvgUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <rect width="800" height="500" rx="20" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
    
    <!-- ヘッダー -->
    <rect x="30" y="30" width="740" height="50" rx="8" fill="#1e293b"/>
    <text x="400" y="62" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">運 転 免 許 証（見本・検証用サンプル）</text>
    
    <!-- 番号・交付日 -->
    <text x="50" y="115" font-family="sans-serif" font-size="14" fill="#64748b">番号: 第 123456789012 号</text>
    <text x="550" y="115" font-family="sans-serif" font-size="14" fill="#64748b">2026年01月01日 交付</text>
    
    <!-- 顔写真プレースホルダー -->
    <rect x="560" y="140" width="190" height="240" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
    <circle cx="655" cy="220" r="45" fill="#cbd5e1"/>
    <path d="M 590 340 Q 655 280 720 340 Z" fill="#cbd5e1"/>
    <text x="655" y="365" font-family="sans-serif" font-size="12" fill="#64748b" text-anchor="middle">写真（サンプル）</text>

    <!-- 個人情報ダミー欄 -->
    <text x="50" y="160" font-family="sans-serif" font-size="14" fill="#64748b">氏名</text>
    <text x="130" y="165" font-family="sans-serif" font-size="28" font-weight="bold" fill="#0f172a">日本 太郎（見本）</text>
    
    <text x="50" y="210" font-family="sans-serif" font-size="14" fill="#64748b">生年月日</text>
    <text x="130" y="210" font-family="sans-serif" font-size="18" fill="#1e293b">1990年（平成2年）05月15日生</text>

    <text x="50" y="255" font-family="sans-serif" font-size="14" fill="#64748b">住所</text>
    <text x="130" y="255" font-family="sans-serif" font-size="18" fill="#1e293b">東京都千代田区霞が関1丁目1番1号</text>

    <text x="50" y="300" font-family="sans-serif" font-size="14" fill="#64748b">交付</text>
    <text x="130" y="300" font-family="sans-serif" font-size="16" fill="#1e293b">東京都公安委員会</text>

    <!-- 有効期限グリーン帯 -->
    <rect x="40" y="330" width="490" height="48" rx="6" fill="#10b981"/>
    <text x="55" y="362" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff">2030年（令和12年）06月15日まで有効</text>

    <!-- 免許の条件・公安委員会 -->
    <rect x="40" y="395" width="720" height="75" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
    <text x="60" y="425" font-family="sans-serif" font-size="13" fill="#64748b">免許の条件等: 眼鏡等</text>
    <text x="60" y="450" font-family="sans-serif" font-size="13" fill="#64748b">種別: 普通 / 準中型 / 自動二輪</text>
    <text x="550" y="440" font-family="sans-serif" font-size="15" font-weight="bold" fill="#dc2626">公 安 委 員 会 印</text>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
