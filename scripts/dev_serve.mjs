#!/usr/bin/env node
/**
 * ローカル検証用の静的サーバー（開発専用）
 *  - dist/ をそのまま配信（本番と同じ内容）
 *  - /mobile-preview.html だけは dev/ から配信（本番 dist には含めない）
 *
 * 使い方: npm run build && npm run serve:dev   → http://localhost:8105/
 */
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = Number(process.env.PORT || 8105);
const DIST = path.resolve('dist');
const DEV_FILES = {
  '/mobile-preview.html': path.resolve('dev/mobile-preview.html'),
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function resolveFile(urlPath) {
  if (DEV_FILES[urlPath]) return DEV_FILES[urlPath];
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, safe);
  if (!file.startsWith(DIST)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  return fs.existsSync(file) ? file : null;
}

http
  .createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname;
    const file = resolveFile(urlPath);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`dev server: http://localhost:${PORT}/  (mobile-preview: /mobile-preview.html)`));
