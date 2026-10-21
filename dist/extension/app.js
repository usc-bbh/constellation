// Constellation page logic: reads a report (PDF upload, the sample, or text handed over by the
// Chrome extension), then renders the summary. Inlined into index.html by build.js, and shipped
// as its own file in the extension, where inline scripts aren't allowed.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUS_TXT = { done: 'Complete', progress: 'In progress', needs: 'Still needed', none: 'Not marked' };
// Status in words for screen readers; on screen the icon and the row highlight carry it.
const srStatus = s => `<span class="sr">${STATUS_TXT[s]}</span>`;
const num = n => { const f = parseFloat(n); return Number.isInteger(f) ? String(f) : String(f); };

const CI = '<svg class="ci" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 3.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const COURSE_CODE = /^[A-Z]{2,4} \d{3}[A-Z]?$/;
// A value that copies itself when clicked. `what` is how the "Copied" announcement names it.
const copyBtn = (value, what, html, cls = '') => `<button type="button" class="copy ${cls}" data-copy="${esc(value)}" data-what="${esc(what)}" aria-label="Copy ${esc(what)}">${html ?? esc(value)}${CI}</button>`;
const codeBtn = (code, title) => `<button type="button" class="copy chip code" translate="no" data-copy="${esc(code)}" data-what="${esc(code)}" aria-label="Copy ${esc(code)}${title ? ` (${esc(title)})` : ''}"${title ? ` title="${esc(title)}"` : ''}>${esc(code)}</button>`;

/* ---------- click to copy ---------- */
async function copyText(text){
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    if (ok) return true;
  } catch (e) {}
  return false;
}
// Both ways of copying failed: show the text selected, ready for the keyboard shortcut.
function showCopyFallback(btn, text){
  document.querySelectorAll('.copyfail').forEach(n => n.remove());
  const box = document.createElement('div');
  box.className = 'copyfail'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Text to copy');
  box.innerHTML = '<b>Press Ctrl+C (Cmd+C on a Mac) to copy.</b> <button type="button">Close</button><textarea readonly></textarea>';
  box.querySelector('textarea').value = text;
  box.querySelector('button').onclick = () => { box.remove(); btn.focus(); };
  (btn.closest('section, .tile') || btn.parentNode).appendChild(box);
  const ta = box.querySelector('textarea'); ta.focus(); ta.select();
}
const copyTimers = new WeakMap();
async function doCopy(btn, text, what){
  if (!(await copyText(text))) { showCopyFallback(btn, text); return; }
  let msg = btn.nextElementSibling;
  if (!msg || !msg.classList.contains('copied-msg')) { msg = document.createElement('span'); msg.className = 'copied-msg'; msg.setAttribute('aria-hidden', 'true'); btn.after(msg); }
  msg.textContent = 'Copied';
  $('#live').textContent = `Copied ${what}`;
  clearTimeout(copyTimers.get(btn));
  copyTimers.set(btn, setTimeout(() => { msg.remove(); }, 1500));
}

function showErr(msg){ const e=$('#err'); e.textContent=msg; e.classList.remove('hidden'); }
function run(text){
  $('#err').classList.add('hidden');
  let r;
  try { r = StarsParser.parse(text); } catch (e) { showErr(e.message); return; }
  if (!r.blocks.length) { showErr('Found the report header but no requirement sections. Make sure the PDF includes the whole report, down to "END OF ANALYSIS".'); return; }
  render(r, text);
}

/* ---------- feedback ---------- */
// The feedback page is part of the website. The extension has no copy of it, so there the link
// opens the live site in a new tab and the summary stays open.
const IN_EXTENSION = location.protocol === 'chrome-extension:';
const FEEDBACK_URL = IN_EXTENSION ? 'https://usc-bbh.github.io/constellation/feedback.html' : 'feedback.html';
const feedbackLink = () => IN_EXTENSION
  ? `<a class="feedback-link" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">Send feedback<span class="sr"> (opens in a new tab)</span></a>`
  : `<a class="feedback-link" href="${FEEDBACK_URL}">Send feedback</a>`;

/* ---------- PDF ---------- */
// pdf.js is bundled into this page by build.js. Its worker runs from a blob made from the bundled
// source, so reading a PDF makes no network request. The Content-Security-Policy enforces that.
let pdfLib;
function loadPdfJs(){
  if (!pdfLib){
    // The web page carries the worker as a string and runs it from a blob. The extension ships it as a file.
    const worker = PDF_WORKER_URL ? new Worker(PDF_WORKER_URL)
      : new Worker(URL.createObjectURL(new Blob([PDF_WORKER_SRC], { type: 'text/javascript' })));
    pdfjsLib.GlobalWorkerOptions.workerPort = worker;
    pdfLib = pdfjsLib;
  }
  return pdfLib;
}
async function pdfToText(file){
  return PdfText.extractText(loadPdfJs(), new Uint8Array(await file.arrayBuffer()));
}
async function handleFile(f){
  if (!f) return;
  if (!(/\.pdf$/i.test(f.name) || f.type === 'application/pdf')) { showErr('That file isn\'t a PDF. On your STARS page, click Print Report and choose Save as PDF.'); return; }
  const drop = $('#drop'), title = $('#dropTitle'), sub = $('#dropSub');
  drop.classList.add('busy'); title.textContent = 'Reading your report…'; sub.textContent = f.name;
  try { run(await pdfToText(f)); }
  catch (e) { showErr(e.message || 'Could not read that PDF. Try saving the STARS page as a PDF again.'); }
  finally { drop.classList.remove('busy'); title.textContent = 'Upload your STARS report PDF'; sub.textContent = 'Drag it here or click to choose a file'; $('#file').value = ''; }
}
/* ---------- links out ---------- */
// Plain links to USC pages; the page itself never contacts them. Course codes open a USC catalogue
// search (cur_cat_oid=22 is the 2025-26 catalogue; update it when a new catalogue is published).
const CATALOGUE = 'https://catalogue.usc.edu/search_advanced.php?cur_cat_oid=22&search_database=Search&search_db=Search&cpage=1&ecpage=1&ppage=1&spage=1&tpage=1&filter%5Bexact_match%5D=1&filter%5Bkeyword%5D=';
const GE_COURSES = 'https://dornsife.usc.edu/ge/courses/ge'; // + the category letter, e.g. gea/
const GE_REQUIREMENTS = 'https://dornsife.usc.edu/ge/requirements/';
const EXT = '<svg class="ext" viewBox="0 0 12 12" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M10 2 5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
const link = (href, html, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${html}${EXT}<span class="sr"> (opens in a new tab)</span></a>`;
const courseLink = code => `<span class="course-link">${link(CATALOGUE + encodeURIComponent(code).replace(/%20/g, '+'), esc(code), 'chip code')}${copyBtn(code, code, '')}</span>`;
const geLetter = name => (String(name).match(/\b(?:Category|GE-)\s*([A-H])\b/) || [])[1];
const geLink = l => link(`${GE_COURSES}${l.toLowerCase()}/`, `See Dornsife's GE-${l} course list`, 'ge-link');

/* ---------- progress by area ---------- */
const areaId = n => 'area-' + n.toLowerCase().replace(/[^a-z]+/g, '-');
// A finished area: a check drawn as three stars, like the logo.
const STAR_CHECK = '<svg class="star-check" viewBox="0 0 24 24" role="img" aria-label="Area complete"><circle cx="12" cy="12" r="11.5" fill="currentColor" opacity=".12"/><path d="M6 12.5 10 16.5 18 7.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><circle cx="6" cy="12.5" r="2.1" fill="currentColor"/><circle cx="10" cy="16.5" r="2.4" fill="currentColor"/><circle cx="18" cy="7.5" r="2.1" fill="currentColor"/></svg>';
const MARKS = `<div class="legend" aria-hidden="true">${['done','progress','needs'].map(k => `<span><i class="mk ${k}"></i>${STATUS_TXT[k]}</span>`).join('')}</div>`;
// What's still needed for one requirement, from STARS's own "what's left" row.
function needBox(l, withLabel){
  const amount = l.count ? `<span class="count">${esc(l.count)} ${esc(l.unit)}</span> still needed` : 'Still needed';
  return `<div class="need ${l.status}"><div>${withLabel ? `<b>${esc(l.label)}.</b> ` : ''}${amount}${l.detail ? `. <span class="detail">${esc(l.detail)}</span>` : ''}</div>
    ${l.options.length ? chips(l.options) : ''}</div>`;
}
function subMore(s, row){
  const bits = [];
  if (s.courses.length) bits.push(`<div class="opts">${s.courses.map(c => (c.isAP ? `<span class="chip code">${esc(c.display)}</span>` : codeBtn(c.code, c.title))).join(' ')}</div>`);
  if (row) bits.push(needBox(row));
  else if (s.status !== 'done' && (s.needs || (s.selectFrom || []).length)) {
    const opts = (s.selectFrom || []).concat(((s.orAlt && s.orAlt.selectFrom) || []).map(o => `or ${o}`));
    bits.push(needBox({ status: s.status, count: s.needs ? num(s.needs) : '', unit: s.needsUnit || '', detail: '', options: opts }));
  }
  if (s.notes.length) bits.push(`<span class="detail">${s.notes.map(esc).join('. ')}</span>`);
  const ge = geLetter(s.name);
  if (ge && s.status !== 'done') bits.push(geLink(ge));
  else if (/GE seminar/i.test(s.name) && s.status !== 'done') bits.push(link(GE_REQUIREMENTS, 'About GE seminars', 'ge-link'));
  return bits.length ? `<div class="sub-more">${bits.join('')}</div>` : '';
}
function reqRow({ block: b, left, subs }){
  const open = b.status !== 'done' && b.kind !== 'cap';
  const body = [`<div class="where">${blockSummary(b)}</div>`];
  if (b.notes.length) body.push(`<div class="detail">${b.notes.map(esc).join('. ')}</div>`);
  left.forEach(l => body.push(needBox(l, true)));
  if (subs.length) body.push(`<ul class="subs">${subs.map(({ sub: s, left: row }) => `<li class="${s.status}"><i class="mk ${s.status}" aria-hidden="true"></i>
    <span><span class="sub-name">${esc(s.name)}</span>${srStatus(s.status)}</span>${subMore(s, row)}</li>`).join('')}</ul>`);
  return `<details class="req ${b.status}"${open ? ' open' : ''}><summary><i class="mk ${b.status}" aria-hidden="true"></i><span class="name">${esc(b.name)}</span>${srStatus(b.status)}</summary>
    <div class="req-body">${body.join('')}</div></details>`;
}
function areaCard(a){
  const n = a.counts, pct = k => (n[k] / a.total * 100).toFixed(1);
  const u = a.units ? `<small>${num(a.units.done)} units done${a.units.progress ? `, ${num(a.units.progress)} in progress` : ''}</small>` : '';
  return `<article class="area-card" id="${areaId(a.name)}">
    <header><h3>${a.complete ? STAR_CHECK : ''}${esc(a.name)}</h3><div class="tally">${n.done} of ${a.total} complete${u}</div></header>
    <div class="meter" role="img" aria-label="${n.done} complete, ${n.progress} in progress, ${n.needs} still needed${n.none ? `, ${n.none} not marked` : ''}"><i class="d" style="width:${pct('done')}%"></i><i class="p" style="width:${pct('progress')}%"></i></div>
    <div class="counts"><span class="done"><b>${n.done}</b> complete</span><span class="progress"><b>${n.progress}</b> in progress</span><span class="needs"><b>${n.needs}</b> still needed</span>${n.none ? `<span class="none"><b>${n.none}</b> not marked</span>` : ''}</div>
    <div class="reqs">${a.blocks.map(reqRow).join('')}</div></article>`;
}

/* ---------- double-check notice ---------- */
// Anything the parser couldn't place is listed here rather than guessed at.
function unreadNotice(r){
  if (!r.unread.length) return '';
  const one = r.unread.length === 1;
  return `<section class="unread" id="check" role="note"><h2>Double-check this against your STARS report</h2>
    <p class="section-note">Constellation wasn't sure how to read ${one ? 'this part' : `these ${r.unread.length} parts`}, so it shows ${one ? 'it' : 'them'} as-is instead of guessing. Each is labelled with the STARS section to find it under.</p>
    <ul>${r.unread.map(u => `<li><b>${esc(u.where)}</b>${u.lines.map(l => `<code>${esc(l)}</code>`).join('')}</li>`).join('')}</ul></section>`;
}

/* ---------- left-hand menu ---------- */
function sideNav(r, areas){
  const item = (id, t, sub = '') => `<li><a href="#${id}">${t}</a>${sub}</li>`;
  const areaLinks = `<ol>${areas.map(a => `<li><a href="#${areaId(a.name)}">${esc(a.name)}</a></li>`).join('')}</ol>`;
  return `<aside class="side"><nav aria-label="On this page"><ol>
    ${item('summary', 'Summary')}${r.unread.length ? item('check', 'Double-check') : ''}${item('areas', 'Progress by area', areaLinks)}
    ${item('history', 'Course history')}${item('rules', 'GE and unit rules')}${item('original', 'Original text')}
  </ol></nav><button type="button" class="primary" id="print"><span class="print-long">Print or save as PDF</span><span class="print-short">Print</span></button></aside>`;
}
// Highlight the menu entry for the section on screen.
function trackSections(){
  if (!('IntersectionObserver' in window)) return;
  const links = [...document.querySelectorAll('.side nav > ol > li > a')];
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return;
    links.forEach(a => a.classList.remove('on'));
    const a = byId.get(vis.target.id); if (a) a.classList.add('on');
  }, { rootMargin: '0px 0px -70% 0px' });
  byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

/* ---------- render ---------- */
function blockSummary(b){
  const e = b.earned && num(b.earned);
  const unitsLine = () => {
    const bits = [];
    if (b.earned) bits.push(`<b>${e}</b> earned`);
    if (b.inProcess) bits.push(`<b>${num(b.inProcess)}</b> in progress`);
    if (b.needs && b.status !== 'done') bits.push(`<b>${num(b.needs)}</b> still needed`);
    return bits.join(', ');
  };
  switch (b.kind){
    case 'units': case 'residency': case 'college': case 'upper':
      return (b.kind === 'upper' && b.status === 'progress') ? `${unitsLine()}. Met once this term's courses are graded.` : unitsLine();
    case 'cap': return `A cap, not a requirement. ${b.status === 'needs' ? 'You are over it; talk to your department.' : 'You are under it.'}`;
    case 'gpa-overall': case 'gpa-major':
      if (b.gpaHidden) return '<span class="muted">GPA not shown in this copy of the report</span>';
      if (!b.earned) return '<span class="muted">No USC grades yet</span>';
      return `Your GPA: <b>${b.earned}</b>${b.status === 'progress' ? '. Final once this term is graded.' : ''}`;
    default: {
      if (!b.subs.length) return unitsLine();
      const d = b.subs.filter(s => s.status === 'done').length;
      const g = /sub-group/.test(b.needsUnit || '') && b.status !== 'done' ? `. Needs <b>${num(b.needs)}</b> more ${+b.needs === 1 ? 'part' : 'parts'}` : '';
      return `<b>${d} of ${b.subs.length}</b> parts complete${g}`;
    }
  }
}
// "Choose from" options: course codes link to the catalogue, "Any GE-X course" to Dornsife's list.
function chips(opts){
  if (!opts.length) return '<span class="muted">Any course</span>';
  const c = o => {
    const m = o.match(/^(or )?([A-Z]{2,4} \d{3}[A-Z]?)$/);
    if (m) return m[1] ? `<span class="opts-or">or ${courseLink(m[2])}</span>` : courseLink(m[2]);
    const ge = o.match(/^Any GE-([A-H]) course$/);
    if (ge) return link(`${GE_COURSES}${ge[1].toLowerCase()}/`, esc(o), 'chip');
    return `<span class="chip ${/^(or )?[A-Z]{2,4} \d/.test(o) ? 'code' : ''}">${esc(o)}</span>`;
  };
  if (opts.length <= 8) return `<div class="opts">${opts.map(c).join('')}</div>`;
  return `<div class="opts">${opts.slice(0,6).map(c).join('')}</div><details class="more"><summary>${opts.length - 6} more options</summary><div class="opts">${opts.slice(6).map(c).join('')}</div></details>`;
}
function render(r, reportText){
  const m = r.meta, S = StarsFormat.deriveSummary(r), T = StarsFormat.transferCredit(r), areas = StarsFormat.areaView(r);
  const NF = 'Not found in report';
  const known = v => v !== null && v !== undefined;
  const gradTerm = m.gradDate ? m.gradDate.replace(/^\d+\s+/, '').toLowerCase().replace(/^\w/, c => c.toUpperCase()).replace(/ (\d{4})$/, ' $1') : '';
  const pctU = n => Math.min(100, n / S.unitsRequired * 100).toFixed(1);
  const left = S.requirementsLeft;
  let h = `<div class="wrap layout">${sideNav(r, areas)}<div class="content">
  <header class="hero" id="summary">
    <div class="top"><div>
      <h1>${esc(m.major || 'Your degree')}</h1>
      <div class="sub">${esc(m.degree || '')}${m.catalogYear ? `, catalog ${esc(StarsParser.termName(m.catalogYear))}` : ''}${m.classLevel ? `. ${esc(m.classLevel)}` : ''}${gradTerm ? `, expected to graduate ${esc(gradTerm)}` : ''}.</div>
    </div>
    ${m.prepared ? `<div class="prepared">STARS report prepared<br>${esc(m.prepared)}</div>` : ''}</div>
    <div class="tiles">
      <div class="tile gpa"><div class="eyebrow">USC GPA</div>
        <div class="v${S.gpa ? '' : ' missing'}">${S.gpa ? copyBtn(S.gpa, 'GPA') : NF}</div>
        <div class="s">${S.gpa ? 'Overall, USC courses only. ' : ''}Major GPA: ${S.majorGpa ? copyBtn(S.majorGpa, 'major GPA') : NF.toLowerCase()}</div></div>
      <div class="tile"><div class="eyebrow">Units completed</div>
        <div class="v${known(S.unitsCompleted) ? '' : ' missing'}">${known(S.unitsCompleted) ? `${num(S.unitsCompleted)}${known(S.unitsRequired) ? ` <small>of ${num(S.unitsRequired)}</small>` : ''}` : NF}</div>
        ${known(S.unitsCompleted) && known(S.unitsRequired) ? `<div class="meter" role="img" aria-label="${num(S.unitsCompleted)} completed, ${num(S.unitsInProgress)} in progress, of ${num(S.unitsRequired)}"><i class="d" style="width:${pctU(S.unitsCompleted)}%"></i><i class="p" style="width:${pctU(S.unitsInProgress)}%"></i></div>` : ''}
        <div class="s">${known(S.unitsInProgress) ? `${num(S.unitsInProgress)} in progress` : ''}${known(S.unitsRequired) ? '' : `${known(S.unitsInProgress) ? '. ' : ''}Units required: ${NF.toLowerCase()}`}</div></div>
      <div class="tile"><div class="eyebrow">Units remaining</div>
        <div class="v${known(S.unitsRemaining) ? '' : ' missing'}">${known(S.unitsRemaining) ? num(S.unitsRemaining) : NF}</div>
        <div class="s">${known(S.unitsRemaining) && S.unitsInProgress ? 'Assumes your current courses pass' : known(S.unitsRemaining) ? 'To graduate' : ''}</div></div>
      <div class="tile"><div class="eyebrow">Transfer &amp; AP units</div>
        <div class="v${known(T.units) ? '' : ' missing'}">${known(T.units) ? num(T.units) : T.courses ? NF : 'None'}</div>
        <div class="s">${T.courses ? `${T.courses} AP or transfer ${T.courses === 1 ? 'course' : 'courses'} listed` : 'None on this report'}</div></div>
      <div class="tile${left ? ' alert' : ''}"><div class="eyebrow">Requirements left</div><div class="v">${left} <small>${left === 1 ? 'item' : 'items'}</small></div>
        <div class="s">${left ? (m.semestersLeft ? `About ${esc(m.semestersLeft)} semesters out` : 'Open below, under each area') : 'All requirements satisfied'}</div></div>
    </div>
  </header><main>`;

  h += unreadNotice(r);

  // progress by area, with what's left inside each requirement
  h += `<section id="areas"><h2>Progress by area</h2><p class="section-note">Every requirement on your report, grouped by area. Open a requirement to see what's left and the courses that count, assuming your current courses pass.</p>${MARKS}<div class="areas">${areas.map(areaCard).join('')}</div></section>`;

  // course history, current term first. Click a code to copy it, anywhere else on a row to copy the line.
  const key = r.key || {};
  const groups = StarsFormat.groupCourses(r.courseList);
  h += `<section id="history"><details class="list"><summary>Course history <span class="count">${r.courseList.length} courses</span></summary>
    <p class="section-note">Click a course code to copy it, or anywhere else on its row to copy the whole line. STARS cuts titles at 29 characters, marked with "…".</p>
    <div class="copy-all no-print"><button type="button" data-copy-all="text">Copy as text</button><button type="button" data-copy-all="tsv">Copy for spreadsheet</button></div>
    <div class="scroll"><table class="stack hist"><thead><tr><th>Course</th><th>Title</th><th>Units</th><th>Grade</th><th>Counts toward</th></tr></thead><tbody>`;
  if (!groups.length) h += `<tr><td colspan="5">No courses on this report yet.</td></tr>`;
  groups.forEach(g => {
    h += `<tr class="term-h"><td colspan="5">${esc(g.label)}${g.current ? ', in progress' : ''}<span class="tu">${num(g.units)} ${g.units === 1 ? 'unit' : 'units'}</span></td></tr>`;
    g.courses.forEach(c => {
      const tags = [];
      if (StarsFormat.isTransfer(c) && !c.isAP) tags.push('<span class="tag">Transfer</span>');
      if (c.flag && c.flag !== 'IP') tags.push(`<span class="tag">${esc((key.flags || {})[c.flag] || `Flag >${c.flag}`)}</span>`);
      const suf = c.suffix.split('').filter(x => x !== 'G').map(x => (key.suffixes || {})[x]).filter(Boolean);
      const gone = /^(D|Z|OS)$/.test(c.flag); // STARS deleted the credit: shown, but muted
      const toward = c.countsToward.filter(t => t !== 'Current registration');
      const code = c.isAP ? 'AP' : c.code;
      h += `<tr class="crs${gone ? ' gone' : ''}">
        <td class="num">${c.isAP ? '<b>AP</b>' : copyBtn(c.code, c.code, `<b>${esc(c.code)}</b>`, 'code')}</td>
        <td>${copyBtn(StarsFormat.formatCourseLine(c, key), `${code === 'AP' ? c.display : code} as one line`, esc(c.isAP ? c.display : c.title), 'line')}${tags.length ? `<div>${tags.join('')}</div>` : ''}${suf.length ? `<div class="detail">${esc(suf.join('. '))}</div>` : ''}</td>
        <td class="num" data-label="Units">${num(c.units)}</td><td class="num" data-label="Grade">${esc(StarsFormat.gradeText(c, key) || 'None listed')}</td>
        <td data-label="Counts toward">${toward.length ? toward.map(esc).join('<br>') : '<span class="muted">Units only</span>'}</td></tr>`;
    });
  });
  h += `</tbody></table></div></details></section>`;

  // the rules STARS applies that the report doesn't spell out on each line
  h += `<section id="rules"><details class="list"><summary>GE and unit rules STARS applies</summary>
    <p class="section-note">How STARS counts your courses toward the requirements above.</p><ul class="fine">
    <li>A single course counts in only one GE Core Literacy category, but can also count toward Global Perspectives.</li>
    <li>At most one GE course (4 units) can be taken pass/no pass.</li>
    <li>Only one GE seminar (GESM) counts for GE credit.</li>
    <li>At most 4 units of physical education count toward your unit total.</li>
    <li>STARS computes your USC GPA only. Honors use the lower of your USC or combined GPA.</li>
  </ul></details></section>`;

  // the report text exactly as read (on screen only; the printout leaves it out)
  h += `<section class="no-print" id="original"><details class="list"><summary>Original report text</summary>
    <p class="section-note">Cross-check anything above against what STARS says.</p><pre class="raw">${esc(reportText.trim())}</pre></details></section>`;

  h += `</main><footer>
    <p class="official">Not an official USC system. Always confirm in STARS and with your advisor.</p>
    <p>Constellation is an unofficial reading aid built by BUAI Builder Hub. Tools by Students, for Students.</p>
    <p>${feedbackLink()}</p>
    <p><button type="button" id="again">Summarize another report</button></p></footer></div></div>`;

  $('#intake').classList.add('hidden');
  const res = $('#result'); res.innerHTML = h; res.classList.remove('hidden');
  $('#again').onclick = reset; $('#print').onclick = () => window.print();
  // A menu link to a folded section opens it.
  res.querySelectorAll('.side nav a').forEach(a => a.addEventListener('click', () => {
    const d = document.querySelector(`${a.getAttribute('href')} > details`); if (d) d.open = true;
  }));
  res.onclick = e => {
    const btn = e.target.closest('button[data-copy], button[data-copy-all]');
    if (btn) {
      if (btn.dataset.copyAll) doCopy(btn, btn.dataset.copyAll === 'tsv' ? StarsFormat.formatCourseworkTsv(r.courseList, key) : StarsFormat.formatCourseworkText(r.courseList, key), btn.dataset.copyAll === 'tsv' ? 'all courses for a spreadsheet' : 'all courses as text');
      else doCopy(btn, btn.dataset.copy, btn.dataset.what);
      return;
    }
    // Anywhere else on a course row copies the whole line, unless the student is selecting text.
    const row = e.target.closest('tr.crs');
    if (row && !String(window.getSelection())) row.querySelector('button.line').click();
  };
  trackSections();
  window.scrollTo(0, 0);
  if (window.Telemetry) window.Telemetry.summarized();
}
function reset(e){ e && e.preventDefault(); $('#result').classList.add('hidden'); $('#result').innerHTML=''; $('#intake').classList.remove('hidden'); }

// The printout shows everything: open every folded section, then put them back as they were.
let closedForPrint = [];
window.addEventListener('beforeprint', () => {
  closedForPrint = [...document.querySelectorAll('#result details:not([open])')];
  closedForPrint.forEach(d => { d.open = true; });
});
window.addEventListener('afterprint', () => { closedForPrint.forEach(d => { d.open = false; }); closedForPrint = []; });
$('#sample').onclick = () => run(SAMPLE);
document.querySelectorAll('[data-feedback]').forEach(p => { p.innerHTML = feedbackLink(); });
// The extension promo is for the website; in the extension it would advertise itself.
if (IN_EXTENSION) $('#promo').remove();
$('#file').onchange = e => handleFile(e.target.files[0]);
$('#home').onclick = reset;
const drop = $('#drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

// The extension hands over the text of the STARS page open in the student's browser.
window.Constellation = { run, showErr };
