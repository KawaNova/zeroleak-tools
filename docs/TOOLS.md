# ZeroLeak Tools 実装済みツール一覧 ＆ 新規ツール追加チェックリスト

（`AGENTS.md` 第12条から分離。ツールの追加・引き継ぎ時のみ参照する）

別のAIエージェントが作業を引き継ぐ際は、以下の構成・検証を必ず維持すること。

### 12.1 実装済み10ツール一覧（すべてファイル送信0バイト実証済み）

#### ① 本人確認・個人情報・画像（ハブ: `/privacy/`）
1. **`/id-watermark/`** (`src/pages/id-watermark.astro`): 免許証・マイナンバー画像 提出用透かし全面焼き込み（不正契約・使い回し防止）
2. **`/exif-remover/`** (`src/utils/exif.ts`): 写真 位置情報（EXIF・GPS）100枚一括ロスレス削除＆純粋TS製ZIP出力
3. **`/pdf-unlock/`** (`src/pages/pdf-unlock.astro`): 給与明細・源泉徴収票PDF パスワード解除（300DPI再構成）＆内部メタデータ完全抹消
4. **`/csv-masking/`** (`src/utils/masking.ts`): CSV/テキスト 個人情報・マイナンバー・カード番号 自動検出＆一括伏字化

#### ② PDF・Office・契約書・法務（ハブ: `/pdf/`）
5. **`/pdf-redaction/`** (`src/utils/pdf-redaction.ts`): 社外秘PDF 完全黒塗り・不可逆墨消し（コピペ復元不可・テキスト層物理破壊）
6. **`/office-metadata-wiper/`** (`src/utils/office-metadata.ts`): 社外秘Office文書（Excel/Word）作成者・会社名・更新履歴完全抹消
7. **`/contract-diff/`** (`src/utils/diff.ts`): 未締結契約書・NDA Myers Diff新旧比較＆赤入れPDFローカル出力

#### ③ ITセキュリティ・開発者（ハブ: `/dev/`）
8. **`/log-masking/`** (`src/utils/log-masking.ts`): 障害調査HAR・サーバーログ・.env 機密トークン（Cookie, Bearer, DBパスワード）一括マスク
9. **`/ai-prompt-sanitizer/`** (`src/utils/prompt-sanitizer.ts`): 生成AI送信前の固有名詞仮名化（`{{COMPANY_A}}`等）＆回答ワンクリック実名復元
10. **`/local-mosaic/`** (`src/utils/mosaic.ts`): 画像 顔・ナンバー・管理画面スクショ 不可逆モザイク＆完全黒塗り

### 12.2 新規ツール追加時の必須チェックリスト（共通UI・SEO・回遊）
新しいツールページ（`src/pages/<tool-slug>.astro`）を追加する際は、必ず以下の6点を実装すること：
1. **タイトル＆H1への複合キーワード注入**: `〜 一括 ブラウザ` / `〜 サーバー送信なし` を必ず含める。
2. **構造化データ（`extraSchemaGraph`）**: `HowTo` と `FAQPage` のJSON-LDを `Layout.astro` に渡す。
3. **ワンクリック検証サンプルボタン**: ユーザーがファイルを用意しなくても3秒で機能を体験できる合成サンプルボタンをファーストビュー直下に置く。
4. **情シス申請用仕様書モーダル**: `<SecuritySpecModal />` を配置し、ヘッダー右上のボタンから呼び出せるようにする。
5. **相互回遊デッキの統合**:
   - ページ最下部に `<RelatedTools currentPath="/<tool-slug>/" />` を配置する。
   - `src/data/tools.ts` の `tools` 配列に新ツールを1件追加する（トップのカード・カテゴリタブ・図解パネル・関連ツール・「何をしたい？」チップはすべてここから描画される唯一の正本）。
   - `src/layouts/Layout.astro` のフッターにリンクを追加する。
   - イラスト `src/assets/illustrations/<image名>.jpg|png` を追加する（ゼロリークくん統一。文字なし・4:3）。未配置の間は絵文字表示になる。
   - `public/sitemap.xml` は `npm run build` 時に `scripts/update_sitemap.mjs` が自動生成する。
6. **自動検証スクリプトへの登録**:
   - `scripts/verify_operations.mjs` にロジック単体テストとビルド後HTML/CSP監査を追加し、`npm run build` 後に `node --experimental-strip-types scripts/verify_operations.mjs` で全スイート `PASSED` を確認する。
