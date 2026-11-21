# やること

終わったら、その行は消す。チェックを付けたまま残さない。

## まだ

## HQに見てほしい
- 【マルチAI対応アーキテクチャ（AGENTS.md共通化 ＆ GEMINI.md/CLAUDE.md/.cursorrules分離）完了報告】
  - ① **共通規律の `AGENTS.md`（agent.md）への完全集約**:
    - 全AIエージェント共通の「最重要教義（0バイト・CSP）」「タスク管理」「性能・0円維持」「Above the Fold」「スクロール予算」「薄型UI」「配色・コピー規律」「全10ツール構成」を `AGENTS.md` に集約・一元化。
  - ② **`GEMINI.md` のAntigravity実行時規律への純化**:
    - `GEMINI.md` から共通規律を切り出し、「`AGENTS.md` への絶対準拠」「Windows PowerShell環境でのスクリプト実行規律」「非同期タスク完了待機」「自動検証・品質予算死守」「Gitコミット・プッシュ」などAntigravity実行時に必ず守るべき規律に純化。
  - ③ **Claude Code（`CLAUDE.md`）＆ Cursor（`.cursorrules`）の配備**:
    - Antigravity、Claude Code、Cursorのどの環境からでも全く同一のプロンプト・行動規範が適用されるマルチAI統一環境を整備。
  - ④ **全自動検証・ビルドPASSED**:
    - `npm run build` エラーゼロ通過。
    - `scripts/verify_operations.mjs` 全12スイート完全 `PASSED`。
- 【2026-11-16 HQ_PLAN の記述と実物の食い違い】HQ_PLAN に「`/dashcam-mute/` 実装済み」「既存19ツール」とあるが、このリポジトリにも本番にも `/dashcam-mute/` は無く、ツールは10本。HQ側の台帳を確認してほしい。
