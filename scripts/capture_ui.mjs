import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const outDir = path.resolve('workspace/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const targetUrl = process.argv[2] || 'http://localhost:8105/';
const mode = process.argv[3] || 'mobile'; // mobile or desktop
const outFile = path.join(outDir, `${mode}_screenshot.png`);

// Chrome または Edge の実行パスを探す
const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserExe = candidates.find(p => fs.existsSync(p));
if (!browserExe) {
  console.error('Browser executable not found.');
  process.exit(1);
}

const windowSize = mode === 'mobile' ? '--window-size=393,852' : '--window-size=1280,800';

const args = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--screenshot=${outFile}`,
  windowSize,
  '--hide-scrollbars',
  targetUrl,
];

console.log(`Launching ${browserExe} to capture ${mode} view of ${targetUrl}...`);
const proc = spawn(browserExe, args);

proc.on('close', (code) => {
  if (fs.existsSync(outFile)) {
    const stats = fs.statSync(outFile);
    console.log(`✔ Successfully captured ${mode} view!`);
    console.log(`  File: ${outFile} (${stats.size} bytes)`);
  } else {
    console.error(`Failed to capture screenshot (exit code: ${code})`);
  }
});
