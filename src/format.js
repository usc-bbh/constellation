/* Constellation formatting: pure functions from parsed report to what the page shows and copies.
   No DOM, no network. The page and test/unit.mjs both use this file, so what is tested is what ships. */
(function (root) {
  const P = root.StarsParser || (typeof require !== 'undefined' ? require('./parser.js') : null);
  const termName = code => P.termName(code);
  const n = v => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? null : parseFloat(v);
  const units = u => `${u} ${u === 1 ? 'unit' : 'units'}`;

  // The numbers at the top of the page. Anything the report doesn't state is null, never a guess.
  function deriveSummary(R) {
    const u = R.units;
    const completed = u ? n(u.earned) : null;
    const inProgress = u ? (n(u.inProcess) ?? 0) : null;
    let remaining = null;
    if (u && u.status === 'done') remaining = 0;
    else if (u && n(u.needs) !== null) remaining = n(u.needs);
    else if (R.unitsRequired !== null && completed !== null) remaining = Math.max(0, R.unitsRequired - completed - inProgress);
    return {
      gpa: R.gpa || null,
      majorGpa: R.majorGpa || null,
      unitsCompleted: completed,
      unitsInProgress: inProgress,
      unitsRequired: R.unitsRequired ?? null,
      unitsRemaining: remaining,
      requirementsLeft: R.overallIncomplete ? R.left.length : 0
    };
  }

  // A code explained in the report's own words, e.g. "TR (transfer course)". Unknown codes stay as written.
  function expandCode(code, table) {
    const t = table && table[code];
    return t ? `${code} (${t.charAt(0).toLowerCase() + t.slice(1)})` : code;
  }

  const isCurrent = c => c.grade === 'RG' || c.flag === 'IP';
  const isTransfer = c => c.isAP || c.grade === 'TR' || /^9999/.test(c.term);

  // The grade as students should read it.
  function gradeText(c, key) {
    if (isCurrent(c)) return 'In progress';
    if (c.isAP) return 'AP credit';
    if (c.grade === 'hidden') return 'Grade hidden';
    if (!c.grade) return '';
    return expandCode(c.grade, key && key.grades);
  }

  // Course history groups: the current term first, then newest to oldest, then transfer and AP credit.
  function groupKey(c) { return c.isAP ? 'AP' : /^9999/.test(c.term) ? 'TR' : c.term; }
  function groupCourses(courses) {
    const groups = new Map();
    for (const c of courses) {
      const k = groupKey(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const rank = k => k === 'AP' ? 2 : k === 'TR' ? 1 : 0;
    const keys = [...groups.keys()].sort((a, b) => {
      const ca = groups.get(a).some(isCurrent), cb = groups.get(b).some(isCurrent);
      if (ca !== cb) return ca ? -1 : 1;
      return rank(a) - rank(b) || b.localeCompare(a);
    });
    return keys.map(k => {
      const cs = groups.get(k).slice().sort((a, b) => a.code.localeCompare(b.code));
      return {
        key: k,
        label: k === 'AP' ? 'AP credit' : k === 'TR' ? 'Transfer credit' : termName(k),
        current: cs.some(isCurrent),
        units: cs.reduce((s, c) => s + (c.units || 0), 0),
        courses: cs
      };
    });
  }
  const ordered = courses => groupCourses(courses).flatMap(g => g.courses);

  // The fields of one copied course. Titles STARS cut short keep their "…": copying the rest would be a guess.
  function courseFields(c, key) {
    if (c.isAP) return { code: 'AP', title: c.display, units: c.units, grade: 'AP credit', term: '' };
    return { code: c.code, title: c.title, units: c.units, grade: gradeText(c, key), term: termName(c.term) };
  }

  // One line for an application box: "CSCI 170, Discrete Methods in Computer Science, 4 units, A, Fall 2025".
  function formatCourseLine(c, key) {
    const f = courseFields(c, key);
    const parts = c.isAP ? [f.title, units(f.units), f.grade] : [f.code, f.title, units(f.units), f.grade, f.term];
    return parts.filter(Boolean).join(', ');
  }

  function formatCourseworkText(courses, key) {
    return ordered(courses).map(c => formatCourseLine(c, key)).join('\n');
  }

  // Tab-separated with a header row, so it pastes into separate spreadsheet columns.
  function formatCourseworkTsv(courses, key) {
    const cell = v => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
    const rows = ordered(courses).map(c => {
      const f = courseFields(c, key);
      return [f.code, f.title, f.units, f.grade, f.term].map(cell).join('\t');
    });
    return ['Code\tTitle\tUnits\tGrade\tTerm', ...rows].join('\n');
  }

  const api = { deriveSummary, expandCode, gradeText, isCurrent, isTransfer, groupCourses, formatCourseLine, formatCourseworkText, formatCourseworkTsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StarsFormat = api;
})(typeof window !== 'undefined' ? window : globalThis);
