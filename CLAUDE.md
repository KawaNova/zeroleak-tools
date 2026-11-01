# Project Rules for Claude Code (CLAUDE.md)

当リポジトリ（`web/003-zeroleak-tools`）において、Claude Code が稼働する際は、**共通運用憲法 [`AGENTS.md`](AGENTS.md) を最優先で遵守**した上で、本ドキュメントの Claude 固有プロトコルに従ってください。

---

## 1. 共通運用憲法への準拠（最優先）
以下を取り込むことで、Antigravity（`GEMINI.md`）・Cursor（`.cursorrules`）と完全に同一の共通ルールが Claude の実行時コンテキストにも読み込まれます。

@AGENTS.md

作業前に第0条〜第12条（タスク管理、0バイト保証、Lighthouse 100点、Above the Fold、スクロール予算、薄型リストUI、信頼の3系統カラー、タイポグラフィ、全10ツール構成）を踏まえて開発・保守を行ってください。

---

## 2. Claude Code 実行時に必ず守らないといけない内容

### ① スクリプト実行規律（Windows PowerShell 環境）
- 複雑な正規表現や日本語マルチバイト文字を含むスクリプトをワンライナー（`node -e "..."` や `python -c "..."`）で直接実行しないこと。
- 調査や置換は一時スクリプトファイル（`scripts/temp_*.mjs` 等）を作成して実行し、作業完了後に削除すること。

### ② ビルド・自動検証の実行規律
- 改修後は必ず以下を実行し、全12スイート `PASSED` を確認すること：
  ```bash
  npm run build
  node --experimental-strip-types scripts/verify_operations.mjs
  ```

### ③ タスク管理と Git コミット・プッシュ規律
- 完了定義（`HQ_PLAN.md`）を満たしたら `TODO.md` から該当行を即座に削除する。
- `git add` → `git commit`（Conventional Commits: `feat(...)` / `fix(...)` / `refactor(...)`）→ `git push origin main` を行う。
- 完了ログ用の独立ファイルは作らず、`git log` に一任する。

### ④ 共通ルールの二重管理禁止
- 全エージェント共通のルールは **`AGENTS.md` のみ**に追記・修正する。`CLAUDE.md` / `GEMINI.md` / `.cursorrules` に重複コピーしない。
