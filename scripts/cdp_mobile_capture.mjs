import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const outDir = path.join(root, 'workspace/screenshots/cdp_mobile');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const HTTP_PORT = 8200;
const CDP_PORT = 9222;

const server = http.createServer((req, res) => {
  let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath);
  const mimeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

// CDP クライアント補助関数
async function callCdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', onMessage);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

server.listen(HTTP_PORT, async () => {
  console.log(`HTTP Server listening on port ${HTTP_PORT}`);

  const tempProfileDir = path.join(root, 'workspace/.tmp_chrome_profile');
  if (!fs.existsSync(tempProfileDir)) fs.mkdirSync(tempProfileDir, { recursive: true });

  const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${tempProfileDir}`,
    `--remote-debugging-port=${CDP_PORT}`,
    'about:blank',
  ]);

  // Chromeの起動待機（リトライ付き）
  let connected = false;
  let versionData = null;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      versionData = await versionRes.json();
      connected = true;
      break;
    } catch (e) {
      // retry
    }
  }

  if (!connected) {
    throw new Error('Failed to connect to Chrome remote debugging port 9222 after 10s');
  }

  try {
    console.log('Connected to Chrome version:', versionData['Browser']);

    const targetsRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');

    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    await callCdp(ws, 'Page.enable');
    await callCdp(ws, 'DOM.enable');

    const devices = [
      { name: 'iphone_se', width: 375, height: 667, scale: 2 },
      { name: 'pixel_7', width: 412, height: 915, scale: 2.625 },
    ];

    const routes = [
      '/',
      '/privacy/',
      '/pdf/',
      '/dev/',
      '/id-watermark/',
      '/pdf-redaction/',
      '/contract-diff/',
      '/csv-masking/',
      '/exif-remover/',
      '/local-mosaic/',
      '/ai-prompt-sanitizer/',
      '/log-masking/',
      '/office-metadata-wiper/',
      '/pdf-unlock/',
      '/legal/',
    ];

    let hasAnyOverflow = false;

    for (const dev of devices) {
      console.log(`Setting mobile device metrics: ${dev.name} (${dev.width}x${dev.height})`);
      await callCdp(ws, 'Emulation.setDeviceMetricsOverride', {
        width: dev.width,
        height: dev.height,
        deviceScaleFactor: dev.scale,
        mobile: true,
        fitWindow: false,
      });

      await callCdp(ws, 'Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5,
      });

      // 初回のリサイズ・レイアウト確定を待機
      await new Promise((r) => setTimeout(r, 500));

      for (const route of routes) {
        const slug = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_|_$/g, '');
        const targetUrl = `http://localhost:${HTTP_PORT}${route}`;

        await callCdp(ws, 'Page.navigate', { url: targetUrl });
        await new Promise((r) => setTimeout(r, 600));

        // ドキュメントの実際の幅（横はみ出しがないか）と高さを検証
        const evalRes = await callCdp(ws, 'Runtime.evaluate', {
          expression: `JSON.stringify({
            vw: window.innerWidth,
            docW: document.documentElement.scrollWidth,
            docH: document.documentElement.scrollHeight,
            bodyW: document.body.scrollWidth,
            hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
          })`,
          returnByValue: true,
        });

        const metrics = JSON.parse(evalRes.result.value);
        if (metrics.hasHorizontalOverflow) {
          hasAnyOverflow = true;
        }
        const overflowStatus = metrics.hasHorizontalOverflow ? `⚠️ OVERFLOW docW=${metrics.docW} > vw=${metrics.vw}` : `✅ PERFECT (vw=${metrics.vw})`;
        console.log(`[${dev.name}] ${route}: ${overflowStatus} (docH=${metrics.docH})`);

        // スクリーンショット撮影
        const shot = await callCdp(ws, 'Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: 0,
            y: 0,
            width: dev.width,
            height: dev.height,
            scale: 1,
          },
        });

        const buf = Buffer.from(shot.data, 'base64');
        const outPath = path.join(outDir, `${dev.name}_${slug}.png`);
        fs.writeFileSync(outPath, buf);
      }
    }

    if (hasAnyOverflow) {
      throw new Error('Horizontal scroll overflow detected in mobile audit!');
    }

    ws.close();
  } catch (err) {
    console.error('CDP Error:', err);
  } finally {
    chromeProc.kill();
    server.close();
    console.log('Capture process finished.');
  }
});
