# ZeroLeak Tools 行動規範・開発規律 (AGENTS.md)

当リポジトリ（`web/003-zeroleak-tools`）で稼働するすべてのAIエージェントおよび開発者が厳守すべき憲法・行動規範です。

---

## 1. 最重要教義：外部API通信・サーバー送信の完全禁止 (Zero-Network Policy)

1. **サーバー送信0バイト絶対保証**:
   - ユーザーがドロップ・入力したファイル（CSV、テキスト、PDF、給与明細、マイナンバー等）は、**ブラウザ内のJavaScript / WASM / Web Worker のみで処理**し、1バイトたりとも外部ネットワークへ送信してはならない。
   - バックエンドAPI、サーバーレス関数、外部AI API（OpenAI等）へのデータ送信は一切禁止する。
2. **CSP（Content Security Policy）による技術的遮断**:
   - `connect-src 'none'` または厳格な自ドメイン限定を設定し、ブラウザ機能として通信を遮断する。
   - Google Tag Manager、サードパーティCDN、外部スクリプトの無断設置を禁止する。
3. **F12 Networkタブ検証バナーの常設**:
   - 全ツール画面の目立つ位置（ファーストビュー）に「🛡️ サーバー送信0バイト保証：F12の開発者ツール Networkタブをご確認ください。本ツールの使用中、外部通信は一切発生しません」を常設し、ユーザー自身が通信ゼロであることをいつでも目視確認できるようにする。

---

## 2. タスク管理規律：完了タスクの即時削除 (TODO.md Governance)

全社規律（[DEPT_MECHANISMS.md](../../00-hq/docs/DEPT_MECHANISMS.md)）に厳格に準拠する：
1. **未完了タスクのみ保持**:
   - 直下の `TODO.md` に完了済みタスク（`[x]`）を残してはならない。タスクが完了したら**即座に行を削除**する。
2. **完了実績はGitに一任**:
   - 過去の完了履歴を記録するテキスト台帳（`HISTORY.md` 等）は作らない。完了実績の唯一の正本は Git コミットログ（`git log`）である。
3. **HQへの相談の一元化**:
   - 開発上の相談や提案は `TODO.md` の `## HQに見てほしい` 節にのみ記載する。

---

## 3. 性能とUX規律：Lighthouse 100点 ＆ 5秒処理完了UX

1. **Lighthouse 100点の徹底**:
   - Astro による完全静的HTML生成と Tailwind CSS の最小限インライン化により、Performance / Accessibility / Best Practices / SEO の全項目で最高水準（スコア95〜100）を維持する。
2. **5秒完了UX**:
   - ドラッグ＆ドロップ後、即座にブラウザ内でローカル解析・マスキング・復号が行われ、ワンクリックで安全にダウンロードできる直感的なUIを提供する。
3. **完全無料・維持費0円の堅持**:
   - Cloudflare Pages の静的配信無料枠のみで運用し、インフラ維持費0円を恒久的に維持する。

---

## 4. 3層記憶アーキテクチャ ＆ note部への知見還元 (ADR-015)

1. **短期記憶 (`workspace/runs/`)**:
   - 各セッションの作業ログやベンチマーク結果を記録。寿命72時間を過ぎたものは `python scripts/reflect.py --archive-expired` により `workspace/archive/` へ退避する。
2. **長期記憶 (`database/experience.json`, `database/playbook.yaml`)**:
   - WASM最適化やローカル処理の技術ノウハウを蓄積する。
3. **noteネタ帳 (`database/episodes.json`)**:
   - 「技術選定の葛藤」「過剰設計の回避」「完全ローカル化の実録」を蓄積し、note部（001）へキラー記事ネタとして供給する。

---

## 5. 法務・免責・信用の完全防衛

1. **統合法務ページ（`/legal/`）の必置**:
   - 「本ツールはクライアントサイドでの処理のみ行いますが、ファイルの破損やデータの取り扱いに関する責任は負いかねます」「パスワード解除ツールは、ご自身が閲覧権限およびパスワードを保有している正規ファイルのみご利用ください」等の完全免責条項、利用規約、AdSense審査準拠プライバシーポリシーを明記する。

---

## 6. 現在の実装済みツール構成 ＆ 共通レイアウト仕様（AI引き継ぎ用）

別のAIエージェントが作業を引き継ぐ際は、以下のコンポーネント・検証構成を必ず維持すること。

### 6.1 実装済み6ツール一覧（すべて外部通信0バイト実証済み）
1. **`/csv-masking/`** (`src/utils/masking.ts`): CSV/テキスト 個人情報・マイナンバー・カード番号 自動検出＆一括伏字化
2. **`/pdf-unlock/`** (`src/pages/pdf-unlock.astro`): 給与明細・源泉徴収票PDF パスワード解除（300DPI再構成）＆内部メタデータ（Author/Title等）完全抹消
3. **`/exif-remover/`** (`src/utils/exif.ts`): 写真 位置情報（EXIF・GPS）100枚一括ロスレス削除＆純粋TS製ZIP出力
4. **`/local-mosaic/`** (`src/utils/mosaic.ts`): 画像 顔・ナンバー・管理画面スクショ 不可逆モザイク＆完全黒塗り（正規化座標による複数画像一括適用＆ZIP出力）
5. **`/ai-prompt-sanitizer/`** (`src/utils/prompt-sanitizer.ts`): ChatGPT・生成AI送信前の固有名詞・機密トークン仮名化（`{{COMPANY_A}}`等）＆AI回答のワンクリック実名復元

> 備考: 旧 `/local-whisper/`（音声文字起こし）は、実際の音声認識を行わず機能が不十分だったため廃止済み。再導入する場合は Whisper WASM 等でオフライン文字起こしを実装し、モデル取得と「0バイト」表記の整合を設計してから行うこと。

### 6.2 新規ツール追加時の必須チェックリスト（共通UI・SEO・回遊）
新しいツールページ（`src/pages/<tool-slug>.astro`）を追加する際は、必ず以下の6点を実装すること：
1. **タイトル＆H1への複合キーワード注入**: `〜 一括 ブラウザ` / `〜 サーバー送信なし` を必ず含める。
2. **構造化データ（`extraSchemaGraph`）**: `HowTo` と `FAQPage` のJSON-LDを `Layout.astro` に渡す。
3. **ワンクリック検証サンプルボタン**: ユーザーがファイルを用意しなくても3秒で機能を体験できる合成サンプル（またはデモデータ）ボタンをファーストビュー直下に置く。
4. **情シス申請用仕様書モーダル**: `<SecuritySpecModal />` を配置し、ヘッダー右上のボタンから呼び出せるようにする。
5. **相互回遊デッキの統合**:
   - ページ最下部に `<RelatedTools currentPath="/<tool-slug>/" />` を配置する。
   - `src/components/RelatedTools.astro` の `ALL_TOOLS` 配列、`src/layouts/Layout.astro` のヘッダー/フッター、`src/pages/index.astro` のカードグリッド、`public/sitemap.xml` に新ルートを追加する。
6. **自動検証スクリプトへの登録**:
   - `scripts/verify_operations.mjs` にロジック単体テストとビルド後HTML/CSP監査を追加し、`npm run build` 後に `node --experimental-strip-types scripts/verify_operations.mjs` で全スイート `PASSED` を確認する。

---

## 7. 次期拡張ロードマップ（Phase 3 高収益・BtoB被リンク獲得ネタ）

Suite 1〜6 に続く収益化・自然被リンク獲得の有望テーマ（`TODO.md` 連動）：

1. **障害調査用 HARファイル / JSONログ / `.env` 機密トークン除去（`/log-masking/`）**:
   - **狙い**: ベンダーやサポートへ `.har` ファイルやエラーログを送る際、中に含まれる `Cookie`、`Authorization` ヘッダー、`sec_key_...` 等のシークレット、メールアドレスを構造を維持したまま一括マスクする。エンジニア・情シスからの被リンク獲得力が極めて高い。
2. **機密PDF 完全黒塗り・不可逆墨消し（`/pdf-redaction/`）**:
   - **狙い**: PDF上に黒い矩形を乗せただけの「コピペで剥がせる黒塗り事故」を防止するため、`pdf-unlock` のCanvasラスタライズ機構と `local-mosaic` の黒塗りUIを結合し、テキスト選択・復元が物理的に不可能な墨消しPDFを生成する。
3. **契約書・NDA条文のローカル差分比較（`/contract-diff/`）**:
   - **狙い**: 外部の無料Diffサイトに貼れない未締結契約書や法務条文の新旧比較をブラウザ内だけで完結させ、リーガルテック系の高単価CPC領域を獲得する。
