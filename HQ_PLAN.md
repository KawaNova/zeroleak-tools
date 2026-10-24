# HQ_PLAN

> 配布日時: 2026-10-24 21:23 JST
> 正本: `00-hq/docs/HQ_PLAN.md`（このファイルはその部署の節だけ）
> 
> 【現場AIの行動ルール】
> 1. 人が「HQ_PLANを見て」と言ったら、このファイルに書かれた作業だけを実行する（補足を人に聞かない・節に無い作業はしない）。
> 2. 【着手前の必須確認】作業を始める前に、必ず既存のコード・ファイル・テスト・`git log` を確認し、各項目が「既に対応済み（完了済み）か」を調査する。既に対応済みの項目は二重作業せずスキップし、`TODO.md` に残っていれば削除して未対応の作業だけを進める。
> 3. 「完了の定義」を満たしたら、直下の `TODO.md` から該当行を【即座に削除】する（チェックを残さない）。
> 4. 完了実績はすべて Git のコミットログ（git log）に記録する（完了台帳や HISTORY.md 等は作らない）。
> 5. HQへの相談や新しい提案がある場合は、直下 `TODO.md` の `## HQに見てほしい` に書く。

対象: WASM完全ローカルツール工場 `web/003-zeroleak-tools`（zeroleak-tools.pages.dev）

> **【着手前の必須確認】**: 作業を始める前に、必ず既存のソースコード・`src/pages/`・テストコード・`git log` を確認し、3層記憶基盤や Phase 1〜3 の各ツール（`/log-masking/`、`/pdf-redaction/`、`/contract-diff/`、`/exif-remover/` 等）が「既にどこまで実装・検証済みか」を確認すること。既に対応済みのツールやタスクは二重に作らず、直下の `TODO.md` に残っていれば即座に削除し、未対応の項目だけを進めること。

2026-10-17 まで:

- **最重要方針**: **コードを書く前にSEOの隙間を見つける。サーバー送信0バイト・情報漏洩0%を担保し、外部API・サーバー通信を一切行わない**。
- AI: **【基盤構築】3層記憶アーキテクチャ（ADR-015）および自己進化・noteネタ発掘システムの配備**（既に対応済みならスキップ）:
  - `workspace/runs/`（短期ログ・72h寿命）、`workspace/archive/`（退避層）、`database/experience.json`, `database/playbook.yaml`, `database/episodes.json` を整備。
  - 自己進化スクリプト `scripts/reflect.py` を配備。
  - 直下に `TODO.md`（関門タグ付き・完了即消し規律）および `AGENTS.md`（行動規律）を配備。
- AI: **【Phase 1〜3 ローカルツールの実装状況確認】**:
  - 既に実装済みのローカルツール（`/log-masking/`、`/pdf-redaction/`、`/contract-diff/` 等）のビルドと「F12 Networkタブで外部通信0バイト証明」の動作を確認する。

2026-10-31 まで（基盤および既存ツールの確認後、直ちに着手）:

- AI: **【完了確認】身分証・マイナンバー透かし焼き込みツール（`/id-watermark/`）およびモバイル最適化完了**:
  - 本番稼働およびスマホ実機（iPhone SE/Pixel 7）の表示検証（はみ出し0px）が完了したことを確認。
- AI: **【最優先着手・1点集中】AI検索・GEO最適化用 `llms.txt` の配備 ＆ HAR・ログ個人情報/APIキー自動マスク（`/log-masking/`）の実装**:
  - **1. AI検索・GEO用 `llms.txt` のトップ配備**:
    - PerplexityやChatGPT Search等のAI検索エンジンに「ZeroLeak Toolsは全ツールがブラウザ内完結・サーバー送信0バイトのセキュリティ特化ツール群」であることを正しく理解・引用させるための `llms.txt` をトップ直下に配備する。
  - **2. `/log-masking/` の実装**:
    - **背景とペイン**: ITエンジニア・情シスがChatGPTやClaudeにエラーログやHARファイル、`.env` を貼り付けて解析させる際、APIキー、Bearerトークン、パスワード、個人情報が外部送信・漏洩する事故を防止する需要。
    - **要件**:
      - テキストエリアまたはファイルドラッグ（.log, .json, .har, .env, .txt）に対応。
      - 正規表現およびパターン認識により「Authorization: Bearer ***」「AKIA*** (AWSキー)」「sk-*** (OpenAIキー)」「password=***」「メールアドレス」「IPv4/IPv6」をローカルで即座に `[MASKED_API_KEY]` 等に自動置換。
      - 外部送信0バイト（完全ローカルWASM/JS処理）。
      - ワンクリックコピー＆ダウンロード機能。
- 完了の定義: `https://zeroleaktools.com/llms.txt` が配備され、`https://zeroleaktools.com/log-masking/` にてログのローカル自動マスキングが正常動作し、F12送信0バイトが確認できること。
