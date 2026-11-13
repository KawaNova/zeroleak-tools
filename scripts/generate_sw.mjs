// dist/sw.js（Service Worker）をビルド成果物から自動生成する。
// `npm run build` の後段で実行され、dist 内の静的ファイル一覧を事前キャッシュ対象として埋め込む。
//
// 設計上の保証（Zero-Network Policy）:
// - 扱うのは「自ドメインの GET リクエスト」だけ。広告など他ドメインの通信には一切介入しない。
// - ユーザーがドロップしたファイル・入力内容は fetch を経由しないため、キャッシュにも保存されない。
// - 外部への送信処理（POST / sync / push 等）は実装しない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');

// 事前キャッシュに含めないファイル（配信設定・クローラー向け・SW自身）
const EXCLUDE = new Set(['sw.js', '_headers', '_redirects', 'ads.txt', 'robots.txt', 'sitemap.xml', 'llms.txt']);

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

if (!fs.existsSync(distDir)) {
  console.error('[generate_sw] dist/ が見つかりません。先に astro build を実行してください。');
  process.exit(1);
}

const files = walk(distDir).filter((f) => !EXCLUDE.has(f)).sort();

// index.html はディレクトリURL（/pdf-unlock/ 等）としてキャッシュする
const urls = files.map((f) => {
  if (f === 'index.html') return '/';
  if (f.endsWith('/index.html')) return `/${f.slice(0, -'index.html'.length)}`;
  return `/${f}`;
});

// 内容ハッシュをバージョンにする（1バイトでも変われば新しいキャッシュへ切り替わる）
const hash = crypto.createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(fs.readFileSync(path.join(distDir, f)));
}
const version = hash.digest('hex').slice(0, 12);

const sw = `// ZeroLeak Tools Service Worker（scripts/generate_sw.mjs が自動生成。手で編集しない）
// 目的: 一度開いたあとは通信を切った状態（機内モード）でも全ツールを動かす。
// 自ドメインの静的ファイルだけを端末にキャッシュする。ユーザーのファイル・入力内容は扱わない。
const CACHE = 'zeroleak-${version}';
const PRECACHE = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zeroleak-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // 他ドメイン（広告配信など）には介入しない
  if (url.origin !== self.location.origin) return;

  // ハッシュ付きの不変アセットはキャッシュ優先
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetchAndStore(request)),
    );
    return;
  }

  // HTML・その他はネットワーク優先（常に最新を表示）。通信できないときだけキャッシュで応答
  event.respondWith(
    fetchAndStore(request).catch(() =>
      caches
        .match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : undefined))
        .then((res) => res || Response.error()),
    ),
  );
});

function fetchAndStore(request) {
  return fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  });
}
`;

fs.writeFileSync(path.join(distDir, 'sw.js'), sw);
const totalBytes = files.reduce((sum, f) => sum + fs.statSync(path.join(distDir, f)).size, 0);
console.log(`[generate_sw] dist/sw.js を生成: ${urls.length} files / ${(totalBytes / 1024 / 1024).toFixed(2)} MB / version ${version}`);
