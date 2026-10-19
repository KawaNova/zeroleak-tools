// public/sitemap.xml を src/pages/*.astro から自動生成する。
// lastmod は各ページファイルの最終コミット日（未コミットの変更がある場合は本日）。
// `npm run build` の前段で実行されるため、手動更新は不要。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = path.join(root, 'src/pages');
const siteUrl = 'https://zeroleaktools.com';

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lastmodOf(relFile) {
  if (git(['status', '--porcelain', '--', relFile])) return today();
  const iso = git(['log', '-1', '--format=%cd', '--date=short', '--', relFile]);
  return iso || today();
}

const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.astro')).sort();

const entries = files.map((f) => {
  const slug = f.replace(/\.astro$/, '');
  const isHome = slug === 'index';
  const isLegal = slug === 'legal';
  return {
    loc: isHome ? `${siteUrl}/` : `${siteUrl}/${slug}/`,
    lastmod: lastmodOf(`src/pages/${f}`),
    changefreq: isLegal ? 'monthly' : 'weekly',
    priority: isHome ? '1.0' : isLegal ? '0.5' : '0.9',
  };
});

// トップを先頭、法務を末尾に固定
entries.sort((a, b) => {
  const rank = (e) => (e.loc === `${siteUrl}/` ? 0 : e.loc.endsWith('/legal/') ? 2 : 1);
  return rank(a) - rank(b) || a.loc.localeCompare(b.loc);
});

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries
    .map(
      (e) =>
        `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`;

fs.writeFileSync(path.join(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml updated: ${entries.length} URLs`);
