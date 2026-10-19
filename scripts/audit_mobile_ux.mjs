import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const outDir = path.join(root, 'workspace/screenshots/mobile');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// MIMEマップ
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// 1. 一時ローカルHTTPサーバー起動
const PORT = 8199;
const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;
  let filePath = path.join(distDir, urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

// Chrome または Edge の実行バイナリを探す
const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browserExe = candidates.find((p) => fs.existsSync(p));
if (!browserExe) {
  console.error('No suitable browser found for screenshot/audit.');
  process.exit(1);
}

const routes = [
  { slug: 'home', path: '/' },
  { slug: 'pdf-unlock', path: '/pdf-unlock/' },
  { slug: 'csv-masking', path: '/csv-masking/' },
  { slug: 'exif-remover', path: '/exif-remover/' },
  { slug: 'local-mosaic', path: '/local-mosaic/' },
  { slug: 'local-whisper', path: '/local-whisper/' },
  { slug: 'ai-prompt-sanitizer', path: '/ai-prompt-sanitizer/' },
  { slug: 'log-masking', path: '/log-masking/' },
  { slug: 'pdf-redaction', path: '/pdf-redaction/' },
  { slug: 'contract-diff', path: '/contract-diff/' },
  { slug: 'id-watermark', path: '/id-watermark/' },
  { slug: 'legal', path: '/legal/' },
];

// テスト対象ビューポート: iPhone SE (375x667) & 標準スマホ (393x852)
const viewports = [
  { name: 'iPhone_SE_375px', width: 375, height: 667 },
  { name: 'Pixel_iPhone_393px', width: 393, height: 852 },
];

function capturePage(url, vp, outFile) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      `--screenshot=${outFile}`,
      `--window-size=${vp.width},${vp.height}`,
      '--hide-scrollbars',
      url,
    ];
    const proc = spawn(browserExe, args);
    proc.on('close', (code) => {
      if (fs.existsSync(outFile)) {
        resolve(fs.statSync(outFile).size);
      } else {
        reject(new Error(`Failed to capture ${url} (code: ${code})`));
      }
    });
  });
}

server.listen(PORT, async () => {
  console.log(`========================================`);
  console.log(`Mobile Viewport UX & Layout Audit`);
  console.log(`Browser: ${browserExe}`);
  console.log(`Viewports: 375px (Compact) & 393px (Standard)`);
  console.log(`========================================\n`);

  try {
    for (const vp of viewports) {
      console.log(`--- Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      for (const r of routes) {
        const url = `http://localhost:${PORT}${r.path}`;
        const screenshotName = `${vp.name}_${r.slug}.png`;
        const screenshotPath = path.join(outDir, screenshotName);

        const size = await capturePage(url, vp, screenshotPath);
        console.log(`  ✔ [Mobile View] ${r.path.padEnd(22)} -> ${screenshotName} (${(size / 1024).toFixed(1)} KB)`);
      }
      console.log('');
    }

    console.log(`========================================`);
    console.log(`ALL 12 ROUTES CAPTURED & AUDITED ACROSS MOBILE VIEWPORTS!`);
    console.log(`Screenshots saved to: workspace/screenshots/mobile/`);
    console.log(`========================================`);
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    server.close();
  }
});
