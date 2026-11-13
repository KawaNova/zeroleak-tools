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
- 【2026-11-13 サイト分析で見つけた、HQ判断が必要な3点】（トップの検索付き一覧化とオフライン動作は実装済み。詳細は git log）
  - ① **AdSense の通信が自サイトのCSPで遮断されている**: 全ページのブラウザコンソールに `https://ep1.adtrafficquality.google/getconfig/sodar` が `connect-src` 違反でブロックされるエラーが出ている。Google の広告品質判定用ドメインで、`*.googlesyndication.com` / `*.google.com` / `*.doubleclick.net` の許可リストに含まれない。審査・配信に影響する可能性があるため、`adtrafficquality.google` を許可リストに足すか判断がほしい（AGENTS.md 第1条の「例外は広告配信ドメインのみ」の解釈の問題なので、現場判断では変更していない）。
  - ② **ツール実行ページにも AdSense スクリプトが読み込まれている**: HQ_PLAN は「ツール実行ページには広告を置かない方針」だが、`Layout.astro` が全ページで `adsbygoogle.js` を読み込んでおり、自動広告を有効にするとツール画面にも広告が出る。審査中のため変更していない。審査後にツールページから外すかどうかの判断がほしい。
  - ③ **ツールページとカテゴリハブの h1 がスマホで16px**: AGENTS.md 第10条は 20〜24px を要求するが、20px にすると h1 が3行になり第4条（h1は2行以内・ファーストビュー内に入力欄）と衝突するページがある。h1 文言の短縮とセットで直す必要があるため未着手（トップページのみ 20px に修正済み）。
