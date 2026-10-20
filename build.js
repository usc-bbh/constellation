// Builds index.html from src/page.html. Everything the page needs is inlined: the parser, the
// page formatting (src/format.js), the page logic (src/app.js), the PDF text extraction, pdf.js and
// its worker (bundled from node_modules), the sample report, and the styles (src/style.css). The
// report never leaves the page. The one exception to "no requests" is src/telemetry.js: anonymous
// GoatCounter counts (visits, summaries, star ratings) once a site code is set in package.json.
// The Content-Security-Policy allows that one host and nothing else. Also builds feedback.html,
// which makes no requests at all.
//
// With --extension it also builds the Chrome extension in dist/extension/: the same page as
// summary.html, but with every script as its own file, because Chrome extensions (Manifest V3)
// don't allow inline scripts. See src/extension/.
// Usage: npm install && npm run build [-- --extension]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const esbuild = require('esbuild');

const read = f => fs.readFileSync(f, 'utf8');
const nm = f => require.resolve(f);

// pdf.js main library as a plain script exposing window.pdfjsLib, and its worker. Same pdfjs-dist
// version (pinned in package.json) that npm test uses.
const bundle = (entry, globalName) => esbuild.buildSync({
  entryPoints: [nm(entry)], bundle: true, format: 'iife', globalName, minify: true,
  platform: 'browser', target: 'es2020', write: false, logLevel: 'error',
  define: { 'import.meta.url': '""' }
}).outputFiles[0].text;
const pdfjs = bundle('pdfjs-dist/legacy/build/pdf.mjs', 'pdfjsLib');
const worker = bundle('pdfjs-dist/legacy/build/pdf.worker.mjs');

// Inline scripts end at the first "</script"; escape it anywhere it appears in inlined code.
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const str = s => safe(JSON.stringify(s));

// Each script the page needs: its placeholder in src/page.html, its file name in the extension,
// and its code. The pdf.js worker setting differs: inline as a string on the web, a file in the extension.
const WORKER_MARK = '<script>const PDF_WORKER_SRC = /*PDFWORKER*/, PDF_WORKER_URL = /*PDFWORKERURL*/;</script>';
const scripts = [
  ['<script>/*PARSER*/</script>', 'parser.js', read('src/parser.js')],
  ['<script>/*FORMAT*/</script>', 'format.js', read('src/format.js')],
  ['<script>/*PDFTEXT*/</script>', 'pdftext.js', read('src/pdftext.js')],
  ['<script>/*PDFJS*/</script>', 'pdf.js', pdfjs],
  [WORKER_MARK, 'pdf-config.js', null],
  ['<script>const SAMPLE = /*SAMPLE*/;</script>', 'sample.js', `const SAMPLE = ${JSON.stringify(read('src/sample-report.txt'))};\n`],
  ['<script>/*APP*/</script>', 'app.js', read('src/app.js')]
];
// GoatCounter site code (package.json "goatcounter"). Empty: telemetry stays off, CSP blocks all.
const GOATCOUNTER = require('./package.json').goatcounter || '';
if (GOATCOUNTER && !/^[a-z0-9-]+$/.test(GOATCOUNTER)) throw new Error('package.json goatcounter must be a GoatCounter site code, like "constellation"');
const GC_HOST = GOATCOUNTER ? `https://${GOATCOUNTER}.goatcounter.com` : '';
const TELEMETRY_MARK = '<script>/*TELEMETRY*/</script>';
const STYLE_MARK = '<style>/*STYLE*/</style>';
const style = `<style>\n${read('src/style.css')}</style>`;
const template = read('src/page.html');
if (!template.includes(TELEMETRY_MARK) || !template.includes(STYLE_MARK)) throw new Error('src/page.html is missing the telemetry or style placeholder');
for (const [mark] of scripts) if (!template.includes(mark)) throw new Error(`src/page.html is missing ${mark}`);

// ---------- web page: everything inline ----------
let page = template.replace(STYLE_MARK, () => style)
  .replace(TELEMETRY_MARK, () => `<script>${safe(read('src/telemetry.js').replace('__GOATCOUNTER_SITE__', GOATCOUNTER))}</script>`);
for (const [mark, , code] of scripts) {
  const inline = code === null
    ? `<script>const PDF_WORKER_SRC = ${str(worker)}, PDF_WORKER_URL = null;</script>`
    : `<script>${safe(code)}</script>`;
  page = page.replace(mark, () => inline); // function form: code contains "$&" and friends
}

// Content-Security-Policy: no connections, no remote anything. Scripts allowed only by hash, so
// an injected or edited script without a rebuild will not run. Workers only from blob: (pdf.js).
// With a GoatCounter code, that one host may receive the count pixel and answer the count read.
const hashesOf = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
const cspOf = (html, host) => [
  "default-src 'none'", `script-src ${hashesOf(html).join(' ')}`, 'worker-src blob:', 'child-src blob:',
  "style-src 'unsafe-inline'", `img-src data: blob:${host ? ' ' + host : ''}`, `connect-src ${host || "'none'"}`,
  "form-action 'none'", "base-uri 'none'"
].join('; ');
const withCsp = (html, host) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${cspOf(html, host)}">`);
page = withCsp(page, GC_HOST);
fs.writeFileSync('index.html', page);
console.log(`Built index.html (${(page.length / 1024).toFixed(0)} KB, ${hashesOf(page).length} inline scripts, telemetry ${GC_HOST ? 'to ' + GC_HOST : 'off'})`);

// ---------- feedback page: a mailto form, no requests ----------
const feedbackTemplate = read('src/feedback.html').replace(STYLE_MARK, () => style);
fs.writeFileSync('feedback.html', withCsp(feedbackTemplate.replace('<script>/*FEEDBACK*/</script>', () => `<script>${safe(read('src/feedback.js'))}</script>`), ''));
console.log('Built feedback.html');

// ---------- Chrome extension: every script as its own file ----------
if (process.argv.includes('--extension')) {
  const out = 'dist/extension';
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

  // The manifest's policy covers extension pages. No telemetry: the extension stays offline.
  let summary = template.replace('<!--CSP-->', '').replace(STYLE_MARK, () => style).replace(TELEMETRY_MARK, '');
  for (const [mark, file, code] of scripts) {
    fs.writeFileSync(path.join(out, file), code === null
      ? "const PDF_WORKER_SRC = null, PDF_WORKER_URL = 'pdf.worker.js';\n" : code);
    summary = summary.replace(mark, () => `<script src="${file}"></script>`);
  }
  fs.writeFileSync(path.join(out, 'pdf.worker.js'), worker);
  summary = summary.replace('</body>', '<script src="summary.js"></script>\n</body>');
  fs.writeFileSync(path.join(out, 'summary.html'), summary);
  fs.copyFileSync('src/extension/background.js', path.join(out, 'background.js'));
  fs.copyFileSync('src/extension/summary.js', path.join(out, 'summary.js'));
  fs.copyFileSync('src/feedback.js', path.join(out, 'feedback.js'));
  fs.writeFileSync(path.join(out, 'feedback.html'), feedbackTemplate.replace('<!--CSP-->', '')
    .replace('<script>/*FEEDBACK*/</script>', '<script src="feedback.js"></script>').replace(/href="index\.html"/g, 'href="summary.html"'));

  const sizes = [16, 32, 48, 128];
  for (const n of sizes) fs.writeFileSync(path.join(out, 'icons', `icon${n}.png`), icon(n));
  const icons = Object.fromEntries(sizes.map(n => [n, `icons/icon${n}.png`]));
  const manifest = {
    manifest_version: 3,
    name: 'Constellation',
    version: require('./package.json').version,
    description: 'Make sense of your STARS. Summarizes the STARS report open in your browser. Nothing leaves your device.',
    icons,
    action: { default_title: 'Summarize this STARS report', default_icon: icons },
    background: { service_worker: 'background.js' },
    // activeTab: clicking the button lets the extension read that one tab, once. No host permissions.
    permissions: ['activeTab', 'scripting'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; default-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"
    }
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  // A stand-in STARS page made from the fictional sample, to try the button without a real report.
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync('dist/sample-stars-page.html', `<!doctype html><meta charset="utf-8"><title>Sample STARS report (fictional)</title>
<pre style="font:13px/1.3 monospace">${esc(read('src/sample-report.txt'))}</pre>\n`);
  console.log(`Built ${out}/ (load it at chrome://extensions with "Load unpacked") and dist/sample-stars-page.html`);
}

// The toolbar icon: the Constellation mark (four stars joined by a line) in USC cardinal, drawn
// straight to a PNG so the build needs no image tools. Coordinates match the 26x26 SVG in page.html.
function icon(size) {
  const S = 4, W = size * S, k = W / 26; // draw 4x larger, then average down for smooth edges
  const ink = new Float32Array(W * W);
  const pts = [[4, 19], [11, 8], [17, 14], [22, 5]];
  const segDist = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const lineW = size <= 16 ? 1.6 : 1.1, r = size <= 16 ? 3.1 : 2.7;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const px = (x + 0.5) / k, py = (y + 0.5) / k;
    let a = 0;
    for (let i = 0; i < 3; i++) if (segDist(px, py, pts[i], pts[i + 1]) <= lineW / 2) a = Math.max(a, 0.5);
    for (const [cx, cy] of pts) if (Math.hypot(px - cx, py - cy) <= r) a = 1;
    ink[y * W + x] = a;
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let a = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) a += ink[(y * S + j) * W + x * S + i];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = 0x99; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = Math.round(a / (S * S) * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
