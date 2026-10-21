// Fails if Constellation could leak a student's report. Run by npm test, after npm run build.
//   1. Git: no report or anything derived from one is tracked or staged (test/samples/,
//      test/expected/, any PDF). .gitignore alone is not enough; a force-add gets past it.
//   2. Source: no URLs, network APIs, or browser storage in src/. The page reads the PDF,
//      renders it, and forgets it. Three narrow exceptions:
//        - src/telemetry.js may reach GoatCounter only, store only the "rated" flag, and must not
//          touch the report or the parsed result.
//        - src/feedback.js may post the feedback form to Google Forms (docs.google.com) only,
//          stores nothing, and must not touch the report. It runs on feedback.html, never on the
//          summary page.
//        - links students click (<a href>) may point to usc.edu pages, the live feedback page,
//          or mailto:. The page itself never loads them.
//   3. Built pages: index.html's Content-Security-Policy blocks every request except the
//      GoatCounter host set in package.json (none while it's empty); feedback.html blocks every
//      request except docs.google.com once a Google Form is set. Neither loads anything from
//      outside itself.
//   4. Built extension (dist/extension/, if built): asks only for activeTab and scripting, no
//      host permissions or storage, blocks connections, and loads only its own files.
// Usage: npm run check:privacy
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// 1. Git
let tracked = null;
try { tracked = execFileSync('git', ['ls-files', '--cached', '--', '.'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
catch { console.log('skip  git check (not a git checkout)'); }
if (tracked) {
  for (const f of tracked) {
    if (/^test\/(samples|expected)\//.test(f) && !f.endsWith('/.keep')) problems.push(`git tracks ${f}. Reports and results derived from them must never be committed.`);
    else if (/\.pdf$/i.test(f)) problems.push(`git tracks ${f}. PDFs must never be committed.`);
  }
}

// 2. Source
const NETWORK = [
  [/\b(?:https?:)?\/\/[a-z0-9-]+\.[a-z]/i, 'a URL'],
  [/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection/, 'a network API'],
  [/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./, 'browser storage'],
  [/<(?:script|link|iframe|img|object|embed)\b[^>]*\b(?:src|href)=/i, 'an external resource tag']
];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const TELEMETRY = 'telemetry.js';
const FEEDBACK = 'feedback.js';
const USC_LINK = /^https:\/\/(?:[a-z0-9-]+\.)*usc\.edu\/|^https:\/\/usc-bbh\.github\.io\/constellation\/feedback\.html$/;
for (const full of walk(path.join(root, 'src'))) {
  const f = path.relative(path.join(root, 'src'), full);
  let text = fs.readFileSync(full, 'utf8');
  if (f === TELEMETRY) {
    const hosts = [...text.matchAll(/[a-z0-9-]+\.(?:com|org|net|edu|io|dev|app)\b/gi)].map(m => m[0].toLowerCase());
    const other = hosts.filter(h => h !== 'goatcounter.com');
    if (other.length) problems.push(`src/${f} names a host other than goatcounter.com: ${other.join(', ')}.`);
    const keys = [...text.matchAll(/localStorage\.\w+\(([^,)]*)/g)].map(m => m[1].trim());
    if (keys.some(k => k !== 'KEY') || !/const KEY = 'constellation-rated';/.test(text)) problems.push(`src/${f} may store only the 'constellation-rated' flag.`);
    if (/sessionStorage|indexedDB|document\.cookie|caches\.|sendBeacon|XMLHttpRequest|WebSocket/.test(text)) problems.push(`src/${f} uses storage or a network API beyond the GoatCounter pixel and count.`);
    if (/StarsParser|StarsFormat|Constellation\.|#result|courseList|getElementById\('result'\)|\.meta\b|redact/.test(text)) problems.push(`src/${f} touches the report. Telemetry must only send fixed names.`);
    continue;
  }
  if (f === FEEDBACK) {
    const urls = [...text.matchAll(/https?:\/\/[^'"\s]+/g)].map(m => m[0]);
    const other = urls.filter(u => !u.startsWith('https://docs.google.com/forms/d/e/'));
    if (other.length) problems.push(`src/${f} names a URL other than a Google Form: ${other.join(', ')}.`);
    if (/localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|sendBeacon|XMLHttpRequest|WebSocket|EventSource/.test(text)) problems.push(`src/${f} uses storage or a network API beyond posting the form.`);
    if (/StarsParser|StarsFormat|Constellation\.|SAMPLE|courseList|redact/.test(text)) problems.push(`src/${f} touches the report. It must send only the feedback form.`);
    continue;
  }
  // Links a student clicks are allowed to usc.edu; strip them before the checks below.
  text = text.replace(/'https:\/\/[^'\s]+'/g, u => USC_LINK.test(u.slice(1, -1)) ? "''" : u);
  for (const [re, what] of NETWORK) if (re.test(text)) problems.push(`src/${f} contains ${what} (${text.match(re)[0]}). The page must make no requests and store nothing.`);
}
const GOATCOUNTER = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).goatcounter || '';
const GC_HOST = GOATCOUNTER ? `https://${GOATCOUNTER}.goatcounter.com` : '';
const FORM_HOST = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).feedbackForm || {}).id ? 'https://docs.google.com' : '';

// 3. Built pages
for (const [name, host, imgHost] of [['index.html', GC_HOST, GC_HOST], ['feedback.html', FORM_HOST, '']]) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) { problems.push(`${name} is missing. Run npm run build.`); continue; }
  const page = fs.readFileSync(file, 'utf8');
  const csp = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  if (!csp) problems.push(`${name} has no Content-Security-Policy. Run npm run build.`);
  else {
    const rules = ["default-src 'none'", `connect-src ${host || "'none'"};`, `img-src data: blob:${imgHost ? ' ' + imgHost : ''};`, "form-action 'none'"];
    for (const rule of rules) if (!csp[1].includes(rule)) problems.push(`${name} CSP is missing ${rule.replace(/;$/, '')}.`);
    if (/unsafe-inline'[^;]*;/.test(csp[1].match(/script-src[^;]*;/)?.[0] || '') || /script-src[^;]*(https?:|\*)/.test(csp[1]))
      problems.push(`${name} CSP allows scripts other than the page's own.`);
    if (page.indexOf(csp[0]) > page.search(/<script|<style/)) problems.push(`${name} CSP must come before the first <style> or <script>.`);
  }
  const ext = page.match(/<(?:script|link|iframe|img|object|embed)\b[^>]*\b(?:src|href)=["']?(?!data:|#)[^"'\s>]+|@import|url\(\s*["']?(?:https?:)?\/\//i);
  if (ext) problems.push(`${name} loads something from outside itself: ${ext[0].slice(0, 80)}`);
}

// 4. Built extension
const extDir = path.join(root, 'dist', 'extension');
if (fs.existsSync(extDir)) {
  const m = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  const extra = (m.permissions || []).filter(p => !['activeTab', 'scripting'].includes(p));
  if (extra.length) problems.push(`extension asks for more than activeTab and scripting: ${extra.join(', ')}.`);
  if ((m.host_permissions || []).length || (m.optional_host_permissions || []).length) problems.push('extension asks for host permissions. It should read a tab only when the student clicks the button.');
  if (m.content_scripts) problems.push('extension declares content scripts, which run without a click.');
  const policy = (m.content_security_policy || {}).extension_pages || '';
  for (const rule of ["connect-src 'none'", "script-src 'self'", "form-action 'none'"])
    if (!policy.includes(rule)) problems.push(`extension policy is missing ${rule}.`);
  for (const file of walk(extDir).filter(f => /\.(html|js)$/.test(f) && !/pdf(\.worker)?\.js$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    const name = path.relative(root, file);
    const ext = text.match(/<(?:script|link|iframe|img|object|embed)\b[^>]*\b(?:src|href)=["']?(?:https?:)?\/\/[^"'\s>]+/i);
    if (ext) problems.push(`${name} loads something from outside the extension: ${ext[0].slice(0, 80)}`);
    if (/localStorage|sessionStorage|indexedDB|chrome\.storage|document\.cookie/.test(text)) problems.push(`${name} uses storage. The extension must store nothing.`);
    if (/goatcounter|Telemetry =/i.test(text)) problems.push(`${name} carries telemetry. The extension must stay offline.`);
  }
}

if (problems.length) {
  console.log(`FAIL  privacy check\n${problems.map(p => '  - ' + p).join('\n')}`);
  process.exit(1);
}
console.log(`PASS  privacy check (nothing tracked; report stays on the device; ${GC_HOST ? 'counts go to ' + GC_HOST + ' only' : 'telemetry off, no requests'})`);
