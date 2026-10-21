// Unit tests for the parts of the page that can be checked without a PDF: the abbreviation key,
// the summary numbers, and exactly what each copy action puts on the clipboard. Runs on the
// fictional report in test/fixture-report.txt, so no real record is needed. It was the on-page
// sample before Tommy Trojan and is kept because it covers most formats the parser handles.
// Usage: node test/unit.mjs (also part of npm test)
import fs from 'fs';
import assert from 'assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const P = require('../src/parser.js');
const F = require('../src/format.js');
const SAMPLE = fs.readFileSync(new URL('./fixture-report.txt', import.meta.url), 'utf8');
const r = P.parse(SAMPLE);

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`ok    ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
};
const course = code => r.courseList.find(c => c.code === code);

test('abbreviation key is read from the report', () => {
  assert.equal(r.key.grades.TR, 'Transfer course');
  assert.equal(r.key.grades.IN, 'Incomplete');
  assert.equal(r.key.flags.IP, 'In-progress course');
  assert.equal(r.key.flags.R, 'Repeatable course'); // not "Required sub-requirement" from the same column
  assert.equal(r.key.flags.OS, 'Repetitious, taken out of sequence. No unit or GPA credit allowed');
  assert.equal(r.key.suffixes.W, 'Course meets citizenship in a global era');
  assert.equal(r.key.exceptions.RW, 'Requirement waiver');
});

test('a report without a legend flags it instead of guessing', () => {
  const noKey = P.parse(SAMPLE.replace(/\*+\s*LEGEND\s*\*+/, ''));
  assert.equal(noKey.key, null);
  assert.ok(noKey.unread.some(u => u.where === 'Abbreviation key'));
});

test('summary numbers match the report', () => {
  assert.deepEqual(F.deriveSummary(r), {
    gpa: '3.412', majorGpa: '3.500', unitsCompleted: 95, unitsInProgress: 16,
    unitsRequired: 128, unitsRemaining: 17, requirementsLeft: 6
  });
});

test('missing unit total is null and flagged, never 128', () => {
  const noTotal = P.parse(SAMPLE.replace(/A MINIMUM OF 128 UNITS IS REQUIRED/, 'UNITS ARE REQUIRED'));
  assert.equal(noTotal.unitsRequired, null);
  assert.equal(F.deriveSummary(noTotal).unitsRequired, null);
  assert.ok(noTotal.unread.some(u => u.where === 'Total units'));
});

test('expandCode uses the report key and leaves unknown codes alone', () => {
  assert.equal(F.expandCode('TR', r.key.grades), 'TR (transfer course)');
  assert.equal(F.expandCode('W', r.key.grades), 'W');
  assert.equal(F.expandCode('A-', r.key.grades), 'A-');
});

test('course line: graded course', () => {
  assert.equal(F.formatCourseLine(course('DSCI 353'), r.key), 'DSCI 353, Data Visualization, 4 units, A, Fall 2025');
});
test('course line: in progress', () => {
  assert.equal(F.formatCourseLine(course('DSCI 450'), r.key), 'DSCI 450, Capstone in Data and Society, 4 units, In progress, Fall 2026');
});
test('course line: AP credit has no grade or term', () => {
  const ap = r.courseList.find(c => c.display === 'AP Statistics');
  assert.equal(F.formatCourseLine(ap, r.key), 'AP Statistics, 4 units, AP credit');
});
test('course line: incomplete grade is explained, title cut by STARS keeps its "…"', () => {
  assert.equal(F.formatCourseLine(course('DSCI 352'), r.key), 'DSCI 352, Machine Learning for Social D…, 4 units, IN (incomplete), Spring 2025');
});
test('course line: 1 unit is singular', () => {
  assert.equal(F.formatCourseLine(course('PHED 140'), r.key), 'PHED 140, Beginning Tennis, 1 unit, P, Spring 2024');
});

test('course history order: current term first, then newest to oldest, AP last', () => {
  const g = F.groupCourses(r.courseList);
  assert.deepEqual(g.map(x => x.label), ['Fall 2026', 'Spring 2026', 'Fall 2025', 'Spring 2025', 'Fall 2024', 'Spring 2024', 'Fall 2023', 'AP credit']);
  assert.equal(g[0].current, true);
  assert.equal(g[0].units, 16);
  assert.equal(g[1].current, false);
});

test('copy as text: one line per course, in page order', () => {
  const lines = F.formatCourseworkText(r.courseList, r.key).split('\n');
  assert.equal(lines.length, r.courseList.length);
  assert.equal(lines[0], 'DSCI 450, Capstone in Data and Society, 4 units, In progress, Fall 2026');
  assert.equal(lines.at(-1), 'AP Spanish Language, 4 units, AP credit');
});

test('copy for spreadsheet: header row, five tab-separated columns on every row', () => {
  const rows = F.formatCourseworkTsv(r.courseList, r.key).split('\n');
  assert.equal(rows[0], 'Code\tTitle\tUnits\tGrade\tTerm');
  assert.equal(rows.length, r.courseList.length + 1);
  for (const row of rows) assert.equal(row.split('\t').length, 5, row);
  assert.equal(rows[1], 'DSCI 450\tCapstone in Data and Society\t4\tIn progress\tFall 2026');
  assert.equal(rows.at(-1), 'AP\tAP Spanish Language\t4\tAP credit\t');
});

test('copy for spreadsheet: tabs or newlines inside a field cannot break columns', () => {
  const odd = [{ ...course('DSCI 353'), title: 'Data\tVisual\nization' }];
  assert.equal(F.formatCourseworkTsv(odd, r.key).split('\n')[1], 'DSCI 353\tData Visual ization\t4\tA\tFall 2025');
});

test('transfer units come from the report\'s own TRNSFR WORK total', () => {
  assert.deepEqual(F.transferCredit(r), { units: 12, courses: 3 });
  const none = P.parse(SAMPLE.replace(/^.*TRNSFR WORK.*$/m, ''));
  assert.equal(F.transferCredit(none).units, null);
});

test('areas: open areas first, finished areas last', () => {
  const a = F.areaView(r);
  assert.deepEqual(a.map(x => [x.name, x.complete]), [
    ['University', false], ['General education', false], ['School and major', false], ['Writing and language', true]
  ]);
  const ge = a.find(x => x.name === 'General education');
  assert.deepEqual(ge.counts, { done: 6, progress: 1, needs: 2, none: 0 });
  // GESM 130 counts in two GE parts but its units only once
  assert.deepEqual(ge.units, { done: 28, progress: 4 });
  assert.equal(a.find(x => x.name === 'University').units, null);
});

test('every "what\'s left" row is shown under some requirement', () => {
  const placed = F.areaView(r).flatMap(a => a.blocks.flatMap(b => [...b.left, ...b.subs.map(s => s.left).filter(Boolean)]));
  assert.equal(placed.length, r.left.length);
  for (const l of r.left) assert.ok(placed.includes(l), l.label);
  assert.ok(!JSON.stringify(r.left).includes('"block"'), 'row references stay out of JSON');
});

test('on-page sample (Tommy Trojan) reads cleanly, with nothing to double-check', () => {
  const t = P.parse(fs.readFileSync(new URL('../src/sample-report.txt', import.meta.url), 'utf8'));
  assert.deepEqual(t.unread, []);
  assert.equal(t.meta.major, 'Business of Fighting On');
  assert.equal(t.meta.classLevel, 'Junior');
  assert.deepEqual(F.deriveSummary(t), {
    gpa: '3.487', majorGpa: '3.567', unitsCompleted: 72, unitsInProgress: 16,
    unitsRequired: 128, unitsRemaining: 40, requirementsLeft: 7
  });
  assert.deepEqual(F.transferCredit(t), { units: 12, courses: 3 });
});

if (failed) { console.log(`\n${failed} unit test(s) failed`); process.exit(1); }
console.log('\nAll unit tests passed');
