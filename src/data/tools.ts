// 6ツールの「唯一の正本」データ。
// トップのカード・各ツールの図解パネル・関連ツール・シチュエーションはすべてここから描画する（重複記述を排除）。
// 画像は src/assets/illustrations/ に置く（無い場合は絵文字プレースホルダーで表示）。

const images = import.meta.glob('../assets/illustrations/*.{png,jpg}', {
  eager: true,
  import: 'default',
}) as Record<string, ImageMetadata>;

export function illustration(name: string): ImageMetadata | undefined {
  return images[`../assets/illustrations/${name}.png`] ?? images[`../assets/illustrations/${name}.jpg`];
}

export interface Panel {
  icon: string;
  label: string; // ふつうのやり方 / 起きる事故 / ZeroLeakなら
  text: string;
}

export interface BlindSpot {
  icon: string;
  title: string;
  html: string; // <strong> を含む本文（折りたたみ内に保持：SEO・審査用の詳細解説）
}

export interface Situation {
  icon: string;
  who: string;
  text: string;
}

export interface Tool {
  slug: string;
  href: string;
  name: string;
  tagline: string;
  icon: string;
  image: string; // illustrations 内のファイル名（拡張子なし）
  // Tailwind はソース内の完全なクラス名を走査するため、ここで文字列として保持する
  accent: {
    text: string;
    border: string;
    soft: string; // 淡い背景
    ring: string;
  };
  panels: [Panel, Panel, Panel];
  blindSpots: BlindSpot[];
  situations: Situation[];
  related: string[]; // 関連ツール slug（2件）
  intent: string; // トップの「何をしたい？」チップ文言
}

export const tools: Tool[] = [
  {
    slug: 'pdf-unlock',
    href: '/pdf-unlock/',
    name: '給与明細PDF パスワード解除',
    tagline: '住宅ローン・e-Tax用。作成者名も消去',
    icon: '🔓',
    image: 'tool-pdf',
    accent: { text: 'text-teal-700', border: 'hover:border-teal-500', soft: 'bg-teal-50', ring: 'border-teal-200' },
    intent: '給与明細を銀行・税務署に出したい',
    panels: [
      { icon: '📄', label: 'ふつうのやり方', text: '誕生日パスワード付きの給与明細PDFを、そのまま銀行やe-Taxに提出する' },
      { icon: '🚨', label: '起きる事故', text: '暗号化PDFは自動審査で弾かれる。焦って無料の解除サイトへ→年収・住所が海外サーバーへ' },
      { icon: '🛡️', label: 'ZeroLeakなら', text: 'あなたの端末内でパスワード解除。作成者名などの隠れ情報も同時に消去' },
    ],
    blindSpots: [
      {
        icon: '🏛️',
        title: '銀行の事前審査やe-Taxは「暗号化PDF」をシステムで拒否する',
        html: 'ネット銀行や国税庁e-Taxの受付フォームは、提出されたPDFを機械的にOCR解析・自動仕分けします。誕生日4桁などのパスワードが付いたままだと、<strong>アップロード時に「暗号化PDFは受領できません」とエラーになり審査がストップ</strong>します。',
      },
      {
        icon: '🚨',
        title: '無料PDF解除サイトはファイルを海外クラウドへアップロードしている',
        html: '一般的な無料PDFツールは、一度ファイルを運営企業のサーバーへ転送して解除しています。源泉徴収票や給与明細には、<strong>年収・勤務先・マイナンバー・住所・口座番号・扶養家族</strong>が記載されています。',
      },
    ],
    situations: [
      { icon: '🏠', who: '住宅ローン', text: 'Web事前・本審査の収入証明に' },
      { icon: '🧾', who: '確定申告', text: 'SmartHR等の源泉徴収票をe-Taxへ' },
      { icon: '📄', who: '見積書・請求書', text: 'PC作成者名・元ファイル名を消して提出' },
    ],
    related: ['exif-remover', 'csv-masking'],
  },
  {
    slug: 'csv-masking',
    href: '/csv-masking/',
    name: 'CSV・テキスト 個人情報伏字化',
    tagline: '氏名・マイナンバー・カード番号を自動検出',
    icon: '📊',
    image: 'tool-csv',
    accent: { text: 'text-emerald-700', border: 'hover:border-emerald-500', soft: 'bg-emerald-50', ring: 'border-emerald-200' },
    intent: 'CSVをベンダーやテスト環境に渡したい',
    panels: [
      { icon: '📊', label: 'ふつうのやり方', text: '「テスト用だから」と本番CSVをそのまま外部ベンダーへ渡す' },
      { icon: '🚨', label: '起きる事故', text: 'マイナンバー入りの提供は番号法違反（懲役4年以下・罰金200万円以下）。無料変換サイトにも写しが残る' },
      { icon: '🛡️', label: 'ZeroLeakなら', text: 'ブラウザ内で個人情報の列を自動判別→伏字。ファイルは外に出ない' },
    ],
    blindSpots: [
      {
        icon: '⚖️',
        title: 'マイナンバー法は「社外ベンダーへの検証提供」を刑事罰で禁止している',
        html: '不具合調査のため本番DBのCSVを求められ、実マイナンバーが含まれたまま共有すると、<strong>番号法違反（懲役4年以下または罰金200万円以下）</strong>に該当します。委託先の監督責任は発注元企業が負います。',
      },
      {
        icon: '🚫',
        title: '無料のWeb変換サイトに本番名簿をアップロードするコンプラ違反',
        html: '無料CSVエディタや変換サイトは、ファイルを一度サーバーへアップロードして処理しています。顧客名簿や社員データを送信した時点で<strong>全社のセキュリティ規定違反（情報漏洩インシデント）</strong>となります。',
      },
    ],
    situations: [
      { icon: '🧑‍💻', who: '開発ベンダーへ共有', text: '障害調査CSVをNDA基準で安全に' },
      { icon: '🧪', who: 'テスト環境の構築', text: '件数・構造はそのままダミー化' },
      { icon: '📣', who: '展示会リード共有', text: '同意のない連絡先だけを事前にマスク' },
    ],
    related: ['ai-prompt-sanitizer', 'local-whisper'],
  },
  {
    slug: 'exif-remover',
    href: '/exif-remover/',
    name: '写真 位置情報（EXIF）一括削除',
    tagline: '自宅・場所の特定を防止。画質は劣化なし',
    icon: '📍',
    image: 'tool-exif',
    accent: { text: 'text-cyan-700', border: 'hover:border-cyan-600', soft: 'bg-cyan-50', ring: 'border-cyan-200' },
    intent: '写真を投稿・出品・提出したい',
    panels: [
      { icon: '📱', label: 'ふつうのやり方', text: 'スマホの写真を、ブログ・メール・Slackにそのまま載せる' },
      { icon: '🚨', label: '起きる事故', text: '写真にGPS座標が埋まったまま。右クリックで撮影場所が地図に出て、自宅が特定される' },
      { icon: '🛡️', label: 'ZeroLeakなら', text: '100枚まとめて位置情報だけを削除。画質の劣化はゼロ' },
    ],
    blindSpots: [
      {
        icon: '📰',
        title: 'ブログ・自社サイト・メールは「生Exifのまま」配信される',
        html: 'XやInstagramは投稿時にExifを消去しますが、<strong>WordPress、note、自社HP、ECサイト、Slack/Teams、メール添付</strong>では、スマホの生JPEGがそのままダウンロード可能な状態で渡されます。',
      },
      {
        icon: '📌',
        title: '数メートル精度のGPS座標から「自宅マンションの部屋」まで特定',
        html: 'Exifには<strong>正確な緯度・経度・高度・撮影日時（秒単位）・端末型番</strong>が刻まれています。右クリック→プロパティだけで、誰でも撮影位置を地図にピンポイント表示できます。',
      },
      {
        icon: '☁️',
        title: '無料Exif削除サイトに「消したい写真」を預ける矛盾',
        html: '一般的な無料ツールは画像をサーバーへアップロードして処理します。<strong>位置情報を消したい自宅写真や社外秘の現場写真を第三者に差し出す</strong>ことになります。',
      },
    ],
    situations: [
      { icon: '🛍️', who: 'フリマ出品', text: '自室の写真から住所・階数を特定させない' },
      { icon: '🏗️', who: '現場写真の報告', text: '機密拠点の座標を100枚一括で除去' },
      { icon: '📰', who: 'ブログ・広報', text: '画質を落とさずメタデータだけ消去' },
    ],
    related: ['local-mosaic', 'pdf-unlock'],
  },
  {
    slug: 'local-mosaic',
    href: '/local-mosaic/',
    name: '画像 モザイク＆黒塗り加工',
    tagline: '画面スクショ・顔・ナンバーを不可逆に加工',
    icon: '🕶️',
    image: 'tool-mosaic',
    accent: { text: 'text-indigo-700', border: 'hover:border-indigo-500', soft: 'bg-indigo-50', ring: 'border-indigo-200' },
    intent: 'スクショや写真を隠して共有したい',
    panels: [
      { icon: '⬛', label: 'ふつうのやり方', text: 'Word・PDF・ペイントで、文字の上に黒い四角を重ねて提出する' },
      { icon: '🚨', label: '起きる事故', text: '全選択コピペで下の文字が丸見えに。無料加工サイトへの画像アップロードも危険' },
      { icon: '🛡️', label: 'ZeroLeakなら', text: 'ピクセルごと書き換えて1枚の画像に。後から剥がすことは不可能' },
    ],
    blindSpots: [
      {
        icon: '📋',
        title: '図形を重ねただけの黒塗りは「全選択コピペ」で文字が丸見えになる',
        html: 'WordやPowerPoint、PDF上で文字の上に黒い四角を重ねただけの場合、<strong>「Ctrl+A → コピー」してメモ帳に貼るだけで、黒塗りの下の文字が平文で復元</strong>されます。本ツールは画像のピクセル自体を不可逆変換します。',
      },
      {
        icon: '☁️',
        title: 'オンライン画像加工サイトは「無加工の生画像」をクラウドへ送信している',
        html: '社内管理画面のキャプチャには、<strong>顧客の個人情報、本番APIキー、社内URL、セッションID</strong>が写り込んでいます。外部サーバーへ送信した時点で情報漏洩事故となります。',
      },
    ],
    situations: [
      { icon: '📘', who: '社内マニュアル', text: '画面キャプチャの顧客名・売上を黒塗り' },
      { icon: '🆘', who: 'サポート問い合わせ', text: 'トークンや社内IPを隠してエラー画面を送る' },
      { icon: '🚗', who: '現場写真', text: '映り込んだ顔・ナンバーを一括モザイク' },
    ],
    related: ['exif-remover', 'ai-prompt-sanitizer'],
  },
  {
    slug: 'local-whisper',
    href: '/local-whisper/',
    name: '音声 文字起こし＆PIIマスク',
    tagline: '会議・1on1の録音をブラウザ内でテキスト化',
    icon: '🎙️',
    image: 'tool-whisper',
    accent: { text: 'text-purple-700', border: 'hover:border-purple-500', soft: 'bg-purple-50', ring: 'border-purple-200' },
    intent: '会議・面談の録音を文字にしたい',
    panels: [
      { icon: '🎙️', label: 'ふつうのやり方', text: '会議や1on1の録音を、クラウドの文字起こしサービスへアップロード' },
      { icon: '🚨', label: '起きる事故', text: '声紋・私語・背景の電話まで保存され、NDA違反に。要約AIの監査ログにも平文で残る' },
      { icon: '🛡️', label: 'ZeroLeakなら', text: '端末内で発話を検出→文字起こし→電話・メールを自動で伏字化' },
    ],
    blindSpots: [
      {
        icon: '🔊',
        title: '音声はテキスト以上の「超高密度データ」であり、物理送信される',
        html: 'AI文字起こしSaaSは、音声ファイルを生データのまま外部サーバーへ転送・保存します。<strong>役員の声紋、感情、同席者の私語、背景の電話の会話</strong>まで記録され、クラウド保存された時点でNDAに抵触します。',
      },
      {
        icon: '📝',
        title: '社内Copilotで要約する前に、個人情報（PII）の除去が必須',
        html: 'Enterprise契約のChatGPTやCopilotで要約する場合でも、<strong>顧客電話番号・メール・マイナンバー・給与額</strong>をそのまま入力すると、社内監査ログに平文保存されます。事前にブラウザ内で伏字化します。',
      },
      {
        icon: '⚡',
        title: '重いAIモデルのDL待ちなし。Web Audio APIで0秒起動',
        html: 'WASM版Whisper等は初回に数百MBのモデル取得が発生します。本ツールはブラウザ標準のWeb Audio APIと軽量VADを使うため、<strong>待ち時間0秒・回線不要</strong>で波形解析と文字起こしができます。',
      },
    ],
    situations: [
      { icon: '🏛️', who: '役員会議・M&A', text: '社外に出せない録音を端末内だけで文字化' },
      { icon: '👥', who: '人事面談・1on1', text: '要配慮情報を含む対話をPIIマスク付きで' },
      { icon: '🎬', who: '研修動画の字幕', text: 'タイムスタンプ付きSRT/VTTをそのまま出力' },
    ],
    related: ['ai-prompt-sanitizer', 'csv-masking'],
  },
  {
    slug: 'ai-prompt-sanitizer',
    href: '/ai-prompt-sanitizer/',
    name: 'AIプロンプト 機密サニタイザー',
    tagline: 'ChatGPT送信前に仮名化。回答は実名に復元',
    icon: '🤖',
    image: 'tool-ai',
    accent: { text: 'text-amber-700', border: 'hover:border-amber-500', soft: 'bg-amber-50', ring: 'border-amber-200' },
    intent: 'AIに相談する前に社名・人名を隠したい',
    panels: [
      { icon: '💬', label: 'ふつうのやり方', text: '実名・金額入りのプロンプトを、Copilot／ChatGPT Enterpriseにそのまま入力' },
      { icon: '🚨', label: '起きる事故', text: '「学習されない」契約でも、管理者の監査ログには平文で残る。プロンプト共有で誤爆も' },
      { icon: '🛡️', label: 'ZeroLeakなら', text: '送る前に {{会社A}} 等へ置換。AIの回答を貼れば実名に一発で復元' },
    ],
    blindSpots: [
      {
        icon: '📜',
        title: '「AI学習なし」でも、管理者の監査ログには平文で永久保存される',
        html: 'Enterprise契約やCopilotが保証するのは「外部のAIモデル学習に使われないこと」です。<strong>情シスの監査ログ（プロンプト履歴）には全員の入力が平文のまま保存</strong>されます。役員の健康診断結果や未発表の人事情報を入力すれば、監査で問題になり得ます。',
      },
      {
        icon: '🔁',
        title: '「このプロンプト良かったよ」という社内共有での誤爆',
        html: 'プロンプトをSlackで共有する機会が増えます。元のプロンプトに取引先の実名や売上金額が含まれていると、<strong>社内チャットや引き継ぎ資料を通じて機密情報が拡散</strong>します。',
      },
    ],
    situations: [
      { icon: '✉️', who: '重要メール・お詫び状', text: '相手先名を隠して作成し、完成文だけ実名に復元' },
      { icon: '📑', who: '契約書・NDAの相談', text: '甲乙の社名やコードネームを記号化' },
      { icon: '🐞', who: '障害ログ・コード', text: '本番APIキーや社内URLを無害化して質問' },
    ],
    related: ['csv-masking', 'local-whisper'],
  },
];

export const toolBySlug = (slug: string) => tools.find((t) => t.slug === slug)!;
