// 契約書・NDA条文 ローカル差分比較（Diff）エンジン
// 外部通信0バイト・純粋クライアントサイド・Myers Diff アルゴリズム

export type DiffChangeType = 'equal' | 'add' | 'delete';

export interface InlineChunk {
  type: DiffChangeType;
  text: string;
}

export interface DiffLine {
  type: 'equal' | 'add' | 'delete' | 'change';
  origLineNum?: number;
  modLineNum?: number;
  text: string;
  inlineChunks?: InlineChunk[];
}

export interface ContractDiffStats {
  totalLines: number;
  changedLines: number;
  addedLines: number;
  deletedLines: number;
  unchangedLines: number;
  addedChars: number;
  deletedChars: number;
  totalChanges: number;
}

export interface ContractDiffResult {
  lines: DiffLine[];
  stats: ContractDiffStats;
}

/**
 * 基本Myers Diffアルゴリズム（LCSベース）
 */
function myersDiff<T>(
  a: T[],
  b: T[],
  equals: (x: T, y: T) => boolean = (x, y) => x === y
): { type: DiffChangeType; value: T }[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v: Record<number, number> = { 1: 0 };
  const trace: Record<number, number>[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1] ?? 0) < (v[k + 1] ?? 0))) {
        x = v[k + 1] ?? 0;
      } else {
        x = (v[k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && equals(a[x], b[y])) {
        x++;
        y++;
      }
      v[k] = x;
      if (x >= n && y >= m) {
        return backtrack(trace, a, b, equals);
      }
    }
  }
  return backtrack(trace, a, b, equals);
}

function backtrack<T>(
  trace: Record<number, number>[],
  a: T[],
  b: T[],
  equals: (x: T, y: T) => boolean
): { type: DiffChangeType; value: T }[] {
  const result: { type: DiffChangeType; value: T }[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && (v[k - 1] ?? 0) < (v[k + 1] ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[prevK] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      result.unshift({ type: 'equal', value: a[x] });
    }
    if (d > 0) {
      if (x === prevX) {
        y--;
        result.unshift({ type: 'add', value: b[y] });
      } else if (y === prevY) {
        x--;
        result.unshift({ type: 'delete', value: a[x] });
      }
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    result.unshift({ type: 'equal', value: a[x] });
  }
  while (x > 0) {
    x--;
    result.unshift({ type: 'delete', value: a[x] });
  }
  while (y > 0) {
    y--;
    result.unshift({ type: 'add', value: b[y] });
  }
  return result;
}

/**
 * 2行間の文字・単語単位のインライン差分を計算
 */
export function computeCharInlineDiff(oldText: string, newText: string): InlineChunk[] {
  // 日本語の助詞・漢字・英単語・空白・記号で細かくトークン化
  const tokenize = (text: string): string[] => {
    return text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+|\s+/gu) || [text];
  };

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const diffs = myersDiff(oldTokens, newTokens);

  const chunks: InlineChunk[] = [];
  for (const d of diffs) {
    if (chunks.length > 0 && chunks[chunks.length - 1].type === d.type) {
      chunks[chunks.length - 1].text += d.value;
    } else {
      chunks.push({ type: d.type, text: d.value });
    }
  }
  return chunks;
}

/**
 * 契約書差分を計算するメイン関数（行単位 ＋ インライン変更）
 */
export function computeDiff(originalText: string, modifiedText: string): ContractDiffResult {
  const origLines = originalText.replace(/\r\n/g, '\n').split('\n');
  const modLines = modifiedText.replace(/\r\n/g, '\n').split('\n');

  const rawDiffs = myersDiff(origLines, modLines);

  const lines: DiffLine[] = [];
  let origLineNum = 1;
  let modLineNum = 1;

  let addedLines = 0;
  let deletedLines = 0;
  let changedLines = 0;
  let unchangedLines = 0;
  let addedChars = 0;
  let deletedChars = 0;

  for (let i = 0; i < rawDiffs.length; i++) {
    const cur = rawDiffs[i];
    const nxt = rawDiffs[i + 1];

    if (cur.type === 'delete' && nxt && nxt.type === 'add') {
      // 変更（行の置き換え）
      const inlineChunks = computeCharInlineDiff(cur.value, nxt.value);
      for (const ch of inlineChunks) {
        if (ch.type === 'add') addedChars += ch.text.length;
        if (ch.type === 'delete') deletedChars += ch.text.length;
      }
      lines.push({
        type: 'change',
        origLineNum: origLineNum++,
        modLineNum: modLineNum++,
        text: nxt.value,
        inlineChunks,
      });
      changedLines++;
      i++; // nxt を消費
    } else if (cur.type === 'delete') {
      deletedChars += cur.value.length;
      lines.push({
        type: 'delete',
        origLineNum: origLineNum++,
        text: cur.value,
      });
      deletedLines++;
    } else if (cur.type === 'add') {
      addedChars += cur.value.length;
      lines.push({
        type: 'add',
        modLineNum: modLineNum++,
        text: cur.value,
      });
      addedLines++;
    } else {
      lines.push({
        type: 'equal',
        origLineNum: origLineNum++,
        modLineNum: modLineNum++,
        text: cur.value,
      });
      unchangedLines++;
    }
  }

  const totalLines = lines.length;
  const totalChanges = changedLines + addedLines + deletedLines;

  return {
    lines,
    stats: {
      totalLines,
      changedLines,
      addedLines,
      deletedLines,
      unchangedLines,
      addedChars,
      deletedChars,
      totalChanges,
    },
  };
}

// 互換性エイリアス
export const compareContracts = computeDiff;

/**
 * 差分サマリーテキスト生成（クリップボードコピー用）
 */
export function formatDiffSummary(result: ContractDiffResult): string {
  const lines: string[] = [
    '========================================',
    '契約書・NDA 差分比較サマリー（ZeroLeak Tools）',
    '========================================',
    `【統計】`,
    `- 全行数: ${result.stats.totalLines} 行`,
    `- 変更箇所: ${result.stats.totalChanges} 箇所`,
    `- 変更行: ${result.stats.changedLines} 行`,
    `- 追加行: ${result.stats.addedLines} 行 (+${result.stats.addedChars} 文字)`,
    `- 削除行: ${result.stats.deletedLines} 行 (-${result.stats.deletedChars} 文字)`,
    '',
    '【変更箇所一覧】',
  ];

  for (const l of result.lines) {
    if (l.type === 'change') {
      const orig = (l.inlineChunks || []).filter(c => c.type !== 'add').map(c => c.text).join('');
      const mod = (l.inlineChunks || []).filter(c => c.type !== 'delete').map(c => c.text).join('');
      lines.push(`[変更] 旧${l.origLineNum}行 -> 新${l.modLineNum}行:`);
      lines.push(`  旧: ${orig}`);
      lines.push(`  新: ${mod}`);
      lines.push('');
    } else if (l.type === 'delete') {
      lines.push(`[削除] 旧${l.origLineNum}行: ${l.text}`);
    } else if (l.type === 'add') {
      lines.push(`[追加] 新${l.modLineNum}行: ${l.text}`);
    }
  }

  lines.push('----------------------------------------');
  lines.push('※ 本サマリーはブラウザ内部（通信0バイト）で客観的テキスト比較されたものです。');
  lines.push('※ 法的解釈・効力については専門家へご相談ください。');
  return lines.join('\n');
}

/**
 * テスト・デモ用サンプルNDA
 */
export function generateSampleContracts(): { original: string; modified: string; oldText: string; newText: string } {
  const original = `秘密保持契約書（原本）

第1条（定義）
本契約において「秘密情報」とは、甲または乙が相手方に開示する営業上または技術上の情報であって、開示の際に秘密である旨が明示されたものをいう。

第2条（秘密保持義務）
1. 相手方から開示を受けた当事者は、秘密情報を善良なる管理者の注意をもって厳重に管理しなければならない。
2. 開示当事者の事前の書面による承諾なく、第三者へ開示または漏洩してはならない。

第3条（損害賠償）
甲または乙が本契約に違反した場合、相手方に現実に生じた直接かつ通常の損害（上限：金1,000,000円）を賠償するものとする。

第4条（有効期間）
本契約の有効期間は、契約締結の日から1年間とする。

第5条（管轄裁判所）
本契約に関する一切の紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とする。
`;

  const modified = `秘密保持契約書（改定案）

第1条（定義）
本契約において「秘密情報」とは、甲または乙が相手方に開示する営業上、技術上、財務上または人事上の情報であって、口頭・書面・電磁的記録を問わず秘密である旨が明示されたものをいう。

第2条（秘密保持義務）
1. 相手方から開示を受けた当事者は、秘密情報を善良なる管理者の注意をもって厳重に管理しなければならない。
2. 開示当事者の事前の書面による承諾なく、第三者へ開示または漏洩してはならない。
3. 受領当事者は、秘密情報を本業務以外の目的で使用してはならない。

第3条（損害賠償）
甲または乙が本契約に違反した場合、相手方に生じた一切の損害（弁護士費用および逸失利益を含む）を全額賠償するものとする。

第4条（有効期間）
本契約の有効期間は、契約締結の日から3年間とする。ただし、営業秘密については契約終了後も存続するものとする。

第5条（管轄裁判所）
本契約に関する一切の紛争については、大阪地方裁判所を第一審の専属的合意管轄裁判所とする。
`;

  return { original, modified, oldText: original, newText: modified };
}
