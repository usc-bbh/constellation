// Constellation page logic: reads a report (PDF upload, the sample, or text handed over by the
// Chrome extension), then renders the summary. Inlined into index.html by build.js, and shipped
// as its own file in the extension, where inline scripts aren't allowed.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUS_TXT = { done: 'Complete', progress: 'In progress', needs: 'Still needed', none: 'Not marked' };
const pill = s => `<span class="pill ${s}">${STATUS_TXT[s]}</span>`;
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
  render(r, StarsParser.redact(text).text);
}

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
/* ---------- progress by area ---------- */
const AREAS = ['University','Writing and language','General education','School and major','Other'];
function areaItems(r, g){
  const items = [];
  r.blocks.filter(b => b.group === g && b.kind !== 'cap').forEach(b => {
    if (b.subs.length) b.subs.forEach(s => items.push({ s: s.status, t: s.name })); else items.push({ s: b.status, t: b.name });
  });
  return items;
}
function areaCards(r){
  let h = '';
  AREAS.forEach(g => {
    const items = areaItems(r, g); if (!items.length) return;
    const n = { done: 0, progress: 0, needs: 0, none: 0 }; items.forEach(i => n[i.s]++);
    const pct = k => (n[k] / items.length * 100).toFixed(1);
    h += `<article class="area-card"><h3>${esc(g)}<span>${n.done} of ${items.length} complete</span></h3>
      <div class="meter" role="img" aria-label="${n.done} complete, ${n.progress} in progress, ${n.needs} still needed${n.none ? `, ${n.none} not marked` : ''}"><i class="d" style="width:${pct('done')}%"></i><i class="p" style="width:${pct('progress')}%"></i></div>
      <div class="counts"><span class="done"><b>${n.done}</b> complete</span><span class="progress"><b>${n.progress}</b> in progress</span><span class="needs"><b>${n.needs}</b> still needed</span>${n.none ? `<span class="none"><b>${n.none}</b> not marked</span>` : ''}</div>
      <ul class="reqs">${items.map(i => `<li class="${i.s}"><i class="mk ${i.s}" aria-hidden="true"></i><span>${esc(i.t)}<span class="sr"> (${STATUS_TXT[i.s]})</span></span></li>`).join('')}</ul></article>`;
  });
  return h;
}
const MARKS = `<div class="legend" aria-hidden="true">${['done','progress','needs'].map(k => `<span><i class="mk ${k}"></i>${STATUS_TXT[k]}</span>`).join('')}</div>`;

/* ---------- couldn't read confidently ---------- */
// Anything the parser couldn't place is listed here rather than guessed at.
function unreadNotice(r){
  if (!r.unread.length) return '';
  return `<section class="unread" data-in="dashboard table print" role="note"><h2>Couldn't read confidently</h2>
    <p class="section-note">Constellation couldn't read ${r.unread.length === 1 ? 'one part' : `${r.unread.length} parts`} of this report with confidence, so it flags ${r.unread.length === 1 ? 'it' : 'them'} here instead of guessing. Check ${r.unread.length === 1 ? 'it' : 'them'} against your STARS report.</p>
    <ul>${r.unread.map(u => `<li><b>${esc(u.where)}</b>${u.lines.map(l => `<code>${esc(l)}</code>`).join('')}</li>`).join('')}</ul></section>`;
}

/* ---------- views ---------- */
const VIEWS = [['dashboard', 'Dashboard'], ['table', 'Table'], ['print', 'Printable']];
function setView(v){
  $('#result').dataset.view = v;
  document.querySelectorAll('.views button').forEach(b => { const on = b.dataset.view === v; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  const p = $('#panel'); if (p) p.setAttribute('aria-labelledby', `tab-${v}`);
  // The table and printable views show the long lists open; the dashboard keeps them folded.
  document.querySelectorAll('#result details.list').forEach(d => { d.open = v !== 'dashboard'; });
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
function subDetail(s){
  const bits = [];
  if (s.courses.length) bits.push(s.courses.map(c => (c.isAP ? `<span class="chip code">${esc(c.display)}</span>` : codeBtn(c.code, c.title)) + (c.flag === 'IP' ? ' <span class="muted">(now)</span>' : '')).join(' '));
  if (s.status !== 'done' && (s.needs || s.selectFrom)) bits.push(`<span>${s.needs ? `Needs <b>${num(s.needs)} ${esc(s.needsUnit)}</b>` : 'Needs'}${s.selectFrom && s.selectFrom.length ? ' from ' + s.selectFrom.map(o => COURSE_CODE.test(o) ? codeBtn(o) : `<span class="chip">${esc(o)}</span>`).join(' ') : ''}${s.orAlt && s.orAlt.selectFrom ? ', or ' + s.orAlt.selectFrom.map(o => COURSE_CODE.test(o) ? codeBtn(o) : `<span class="chip">${esc(o)}</span>`).join(' ') : ''}</span>`);
  if (s.notes.length) bits.push(`<span class="detail">${s.notes.map(esc).join('. ')}</span>`);
  return `<div class="opts" style="align-items:center">${bits.join(' ')}</div>`;
}
function chips(opts){
  if (!opts.length) return '<span class="muted">Any course</span>';
  const c = o => {
    const m = o.match(/^(or )?([A-Z]{2,4} \d{3}[A-Z]?)$/);
    if (m) return m[1] ? `<span class="opts-or">or ${codeBtn(m[2])}</span>` : codeBtn(m[2]);
    return `<span class="chip ${/^(or )?[A-Z]{2,4} \d/.test(o) ? 'code' : ''}">${esc(o)}</span>`;
  };
  if (opts.length <= 8) return `<div class="opts">${opts.map(c).join('')}</div>`;
  return `<div class="opts">${opts.slice(0,6).map(c).join('')}</div><details class="more"><summary>${opts.length - 6} more options</summary><div class="opts">${opts.slice(6).map(c).join('')}</div></details>`;
}
function render(r, redactedText){
  const m = r.meta, S = StarsFormat.deriveSummary(r);
  const NF = 'Not found in report';
  const known = v => v !== null && v !== undefined;
  const gradTerm = m.gradDate ? m.gradDate.replace(/^\d+\s+/, '').toLowerCase().replace(/^\w/, c => c.toUpperCase()).replace(/ (\d{4})$/, ' $1') : '';
  const pctU = n => Math.min(100, n / S.unitsRequired * 100).toFixed(1);
  const left = S.requirementsLeft;
  let h = `<header class="hero"><div class="wrap">
    <div class="top"><div>
      <h1>${esc(m.major || 'Your degree')}</h1>
      <div class="sub">${esc(m.degree || '')}${m.catalogYear ? `, catalog ${esc(StarsParser.termName(m.catalogYear))}` : ''}${m.classLevel ? `. ${esc(m.classLevel)}` : ''}${gradTerm ? `, expected to graduate ${esc(gradTerm)}` : ''}.</div>
    </div>
    ${m.prepared ? `<div class="prepared">STARS report prepared<br>${esc(m.prepared)}</div>` : ''}</div>
    <div class="tiles">
      <div class="tile gpa"><div class="l">USC GPA</div>
        <div class="v${S.gpa ? '' : ' missing'}">${S.gpa ? copyBtn(S.gpa, 'GPA') : NF}</div>
        <div class="s">${S.gpa ? 'Overall, USC courses only. ' : ''}Major GPA: ${S.majorGpa ? copyBtn(S.majorGpa, 'major GPA') : NF.toLowerCase()}</div></div>
      <div class="tile"><div class="l">Units completed</div>
        <div class="v${known(S.unitsCompleted) ? '' : ' missing'}">${known(S.unitsCompleted) ? `${num(S.unitsCompleted)}${known(S.unitsRequired) ? ` <small>of ${num(S.unitsRequired)}</small>` : ''}` : NF}</div>
        ${known(S.unitsCompleted) && known(S.unitsRequired) ? `<div class="meter" role="img" aria-label="${num(S.unitsCompleted)} completed, ${num(S.unitsInProgress)} in progress, of ${num(S.unitsRequired)}"><i class="d" style="width:${pctU(S.unitsCompleted)}%"></i><i class="p" style="width:${pctU(S.unitsInProgress)}%"></i></div>` : ''}
        <div class="s">${known(S.unitsInProgress) ? `${num(S.unitsInProgress)} in progress` : ''}${known(S.unitsRequired) ? '' : `${known(S.unitsInProgress) ? '. ' : ''}Units required: ${NF.toLowerCase()}`}</div></div>
      <div class="tile"><div class="l">Units remaining</div>
        <div class="v${known(S.unitsRemaining) ? '' : ' missing'}">${known(S.unitsRemaining) ? num(S.unitsRemaining) : NF}</div>
        <div class="s">${known(S.unitsRemaining) && S.unitsInProgress ? 'Assumes your current courses pass' : known(S.unitsRemaining) ? 'To graduate' : ''}</div></div>
      <div class="tile${left ? ' alert' : ''}"><div class="l">Requirements left</div><div class="v">${left} <small>${left === 1 ? 'item' : 'items'}</small></div>
        <div class="s">${left ? (m.semestersLeft ? `About ${esc(m.semestersLeft)} semesters out` : 'See the list below') : 'All requirements satisfied'}</div></div>
    </div>
  </div></header><main class="wrap">
  <div class="views" role="tablist" aria-label="Views">${VIEWS.map(([k, t]) => `<button type="button" role="tab" id="tab-${k}" data-view="${k}" aria-controls="panel" aria-selected="false" tabindex="-1">${t}</button>`).join('')}</div>
  <div id="panel" role="tabpanel">
  <div class="view-actions no-print" data-in="print"><button class="primary" id="print">Print or save as PDF</button></div>`;

  h += unreadNotice(r);

  // progress by area
  h += `<section data-in="dashboard print"><h2>Progress by area</h2><p class="section-note">Each requirement on your report, grouped by area.</p>${MARKS}<div class="areas">${areaCards(r)}</div></section>`;

  // what's left
  h += `<section data-in="dashboard table print"><h2>What's left</h2><p class="section-note">Everything STARS still marks as open, assuming your current courses pass.</p><div class="scroll"><table class="stack">
    <thead><tr><th>Area</th><th>Requirement</th><th>Needed</th><th>Choose from</th><th>Status</th></tr></thead><tbody>`;
  if (!r.left.length) h += `<tr><td colspan="5">Nothing left. Every requirement is complete or in progress.</td></tr>`;
  r.left.forEach(l => {
    h += `<tr><td class="muted area">${esc(l.area)}</td><td><b>${esc(l.label)}</b>${l.detail ? `<div class="detail">${esc(l.detail)}</div>` : ''}</td>
      <td class="num" data-label="Needed">${l.count ? `<span class="big">${esc(l.count)}</span> ${esc(l.unit)}` : '<span class="muted">See list</span>'}</td>
      <td data-label="Choose from">${chips(l.options)}</td>
      <td>${pill(l.status)}</td></tr>`;
  });
  h += `</tbody></table></div></section>`;

  // checklist
  h += `<section data-in="table print"><h2>Requirement checklist</h2><p class="section-note">Every requirement on your report, in plain language.</p><div class="scroll"><table class="stack check">
    <thead><tr><th style="width:34%">Requirement</th><th>Where you stand</th><th>Status</th></tr></thead><tbody>`;
  ['University','Writing and language','General education','School and major','Other'].forEach(g => {
    const bs = r.blocks.filter(b => b.group === g); if (!bs.length) return;
    h += `<tr><td colspan="3" class="group-h">${esc(g)}</td></tr>`;
    bs.forEach(b => {
      h += `<tr><td><b>${esc(b.name)}</b></td><td>${blockSummary(b)}${b.notes.length ? `<div class="detail">${b.notes.map(esc).join('. ')}</div>` : ''}</td><td>${pill(b.status)}</td></tr>`;
      b.subs.forEach(s => {
        h += `<tr class="sub"><td>${esc(s.name)}</td><td>${subDetail(s)}</td><td>${pill(s.status)}</td></tr>`;
      });
    });
  });
  h += `</tbody></table></div></section>`;

  // course history, current term first. Click a code to copy it, anywhere else on a row to copy the line.
  const key = r.key || {};
  const groups = StarsFormat.groupCourses(r.courseList);
  h += `<section data-in="table print"><details class="list"><summary>Course history <span class="count">${r.courseList.length} courses</span></summary>
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

  // fine print
  h += `<section data-in="table print"><details class="list"><summary>Rules and fine print</summary><ul class="fine">
    <li>A single course counts in only one GE Core Literacy category, but can also count toward Global Perspectives.</li>
    <li>At most one GE course (4 units) can be taken pass/no pass.</li>
    <li>Only one GE seminar (GESM) counts for GE credit.</li>
    <li>At most 4 units of physical education count toward your unit total.</li>
    <li>STARS computes your USC GPA only. Honors use the lower of your USC or combined GPA.</li>
  </ul></details></section>`;

  // raw toggle (on screen only; the printout leaves it out)
  h += `<section class="no-print" data-in="dashboard table"><details><summary>Original report text <span class="count">personal details removed</span></summary>
    <p class="section-note">Cross-check anything above against what STARS says.</p><pre class="raw">${esc(redactedText.slice(redactedText.indexOf('PREPARED')))}</pre></details></section>`;

  h += `</div></main><footer class="wrap">
    <p>Removed before reading: ${esc(r.redacted.join(', ') || 'nothing found')}. Report prepared ${esc(r.meta.prepared)}.</p>
    <p>Constellation is an unofficial reading aid built by BUAI Builder Hub. STARS and your academic advisor are the source of truth for graduation.</p>
    <p><button id="again">Summarize another report</button></p></footer>`;

  $('#intake').classList.add('hidden');
  const res = $('#result'); res.innerHTML = h; res.classList.remove('hidden');
  $('#again').onclick = reset; $('#print').onclick = () => window.print();
  const tabs = [...document.querySelectorAll('.views button')];
  tabs.forEach((b, i) => {
    b.onclick = () => setView(b.dataset.view);
    b.onkeydown = e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      const t = tabs[(i + d + tabs.length) % tabs.length]; setView(t.dataset.view); t.focus(); e.preventDefault();
    };
  });
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
  setView('dashboard'); window.scrollTo(0, 0);
}
function reset(e){ e && e.preventDefault(); $('#result').classList.add('hidden'); $('#result').innerHTML=''; $('#intake').classList.remove('hidden'); }

// Printing from any view gives the full printable version, with the long lists open.
window.addEventListener('beforeprint', () => document.querySelectorAll('#result details.list').forEach(d => { d.open = true; }));
window.addEventListener('afterprint', () => { const v = $('#result').dataset.view; if (v) setView(v); });
$('#sample').onclick = () => run(SAMPLE);
$('#file').onchange = e => handleFile(e.target.files[0]);
$('#home').onclick = reset;
const drop = $('#drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

// The extension hands over the text of the STARS page open in the student's browser.
window.Constellation = { run, showErr };
