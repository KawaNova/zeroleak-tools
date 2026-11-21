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

const toolRoutes = new Set([
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
]);

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
  '/about/',
];

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv; charset=utf-8',
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

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

  let connected = false;
  let versionData = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      versionData = await versionRes.json();
      connected = true;
      break;
    } catch {}
  }

  try {
    if (!connected) {
      throw new Error('Failed to connect to Chrome remote debugging port 9222');
    }
    console.log('Connected to Chrome version:', versionData['Browser']);

    const targetsRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    let currentRequests = [];
    let currentExceptions = [];

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Network.requestWillBeSent') {
          currentRequests.push(msg.params?.request?.url || '');
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const ex = msg.params?.exceptionDetails;
          currentExceptions.push(ex?.exception?.description || ex?.text || 'Unknown JS exception');
        }
      } catch {}
    });

    await callCdp(ws, 'Page.enable');
    await callCdp(ws, 'DOM.enable');
    await callCdp(ws, 'Network.enable');
    await callCdp(ws, 'Runtime.enable');
    await callCdp(ws, 'Network.setCacheDisabled', { cacheDisabled: true });

    const devices = [
      { name: 'iphone_se', width: 375, height: 667, scale: 2 },
      { name: 'pixel_7', width: 412, height: 915, scale: 2.625 },
    ];

    const failures = [];

    for (const dev of devices) {
      console.log(`\nSetting mobile device metrics: ${dev.name} (${dev.width}x${dev.height})`);
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

      await new Promise((r) => setTimeout(r, 400));

      for (const route of routes) {
        const slug = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_|_$/g, '');
        const targetUrl = `http://localhost:${HTTP_PORT}${route}`;

        currentRequests = [];
        currentExceptions = [];

        await callCdp(ws, 'Page.navigate', { url: targetUrl });
        await new Promise((r) => setTimeout(r, 900));

        const evalRes = await callCdp(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const h1 = document.querySelector('h1');
            let h1FontSize = 0;
            let h1Lines = 0;
            if (h1) {
              const st = getComputedStyle(h1);
              h1FontSize = parseFloat(st.fontSize) || 0;
              const lh = parseFloat(st.lineHeight) || (h1FontSize * 1.25);
              h1Lines = Math.round(h1.getBoundingClientRect().height / lh);
            }
            const actionEl = Array.from(document.querySelectorAll('#dropZonePdf, #dropZone, #dropZoneExif, #dropZoneMosaic, #rawPromptTextarea, #dropZoneLog, #dropZonePdfRedact, #originalText, #dropZoneOffice'))
              .find((el) => el.getBoundingClientRect().height > 0);
            const actionTop = actionEl ? Math.round(actionEl.getBoundingClientRect().top) : null;
            return JSON.stringify({
              vw: window.innerWidth,
              docW: document.documentElement.scrollWidth,
              docH: document.documentElement.scrollHeight,
              hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
              h1FontSize,
              h1Lines,
              actionTop,
            });
          })()`,
          returnByValue: true,
        });

        const metrics = JSON.parse(evalRes.result.value);
        const extRequests = currentRequests.filter(
          (u) => /^https?:\/\//i.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(u)
        );
        const isTool = toolRoutes.has(route);

        if (metrics.hasHorizontalOverflow) {
          failures.push(`[${dev.name}] ${route}: horizontal overflow docW=${metrics.docW} > vw=${metrics.vw}`);
        }
        if (currentExceptions.length > 0) {
          failures.push(`[${dev.name}] ${route}: runtime exception: ${currentExceptions.join(' | ')}`);
        }
        if (isTool && extRequests.length > 0) {
          failures.push(`[${dev.name}] ${route}: external requests detected on tool page (${extRequests.length}): ${extRequests.join(', ')}`);
        }
        if (dev.name === 'iphone_se') {
          if (metrics.h1FontSize < 20) {
            failures.push(`[${dev.name}] ${route}: H1 fontSize=${metrics.h1FontSize}px (< 20px)`);
          }
          if (metrics.h1Lines > 2) {
            failures.push(`[${dev.name}] ${route}: H1 wraps to ${metrics.h1Lines} lines (> 2 lines)`);
          }
          if (route === '/' && metrics.docH > 2000) {
            failures.push(`[${dev.name}] ${route}: scroll budget exceeded docH=${metrics.docH} (> 2000px)`);
          }
          if (isTool && (metrics.actionTop === null || metrics.actionTop >= 600)) {
            failures.push(`[${dev.name}] ${route}: action area top=${metrics.actionTop} not cleanly above the fold (< 600)`);
          }
        }

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
        fs.writeFileSync(path.join(outDir, `${dev.name}_${slug}.png`), Buffer.from(shot.data, 'base64'));

        const statusTag = metrics.hasHorizontalOverflow ? '❌ OVERFLOW' : '✅';
        const toolTag = isTool ? ` ext=${extRequests.length} actionTop=${metrics.actionTop}` : '';
        console.log(
          `${statusTag} [${dev.name}] ${route}: vw=${metrics.vw} docH=${metrics.docH} h1=${metrics.h1FontSize}px(${metrics.h1Lines}L)${toolTag}`
        );
      }
    }

    ws.close();

    if (failures.length > 0) {
      console.error('\n❌ CDP Mobile & Zero-Network Audit FAILED:');
      for (const f of failures) console.error('  -', f);
      process.exitCode = 1;
    } else {
      console.log('\n🎉 ALL CDP MOBILE LAYOUT, H1, ABOVE-THE-FOLD & ZERO-NETWORK AUDITS PASSED!');
    }
  } catch (err) {
    console.error('CDP Error:', err);
    process.exitCode = 1;
  } finally {
    chromeProc.kill();
    server.close();
    console.log('Capture process finished.');
  }
});
