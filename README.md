> **OPEN QUESTION: should Constellation share the STARS parser with TrojanReg?** Constellation uses its own parser (`src/parser.js`). TrojanReg uses [`stars-parser/`](https://github.com/usc-bbh/next-sem-validator/tree/main/gui/stars-parser), which now lives in RegCheck (`usc-bbh/next-sem-validator`). Sharing one parser is an option we haven't decided on. See [Parser strategy](#parser-strategy) for the trade-offs.

# Constellation

**Make sense of your STARS.** Turns a USC STARS report into a clear, readable summary.

**Live:** https://usc-bbh.github.io/constellation/ (GitHub Pages, rebuilt on every push to `main`).

A student or advisor opens the page, drops in a STARS report PDF, and gets one page showing what's done, what's in progress, and what's left. It's easier to read than the raw report, and the original text is one click away for cross-checking.

Owner: Natalie. Constellation is its own project, in its own repo (`usc-bbh/constellation`). It can be used next to RegCheck and the degree planner, but it doesn't depend on them.

## Privacy: the report never leaves the device

- **The report stays in the browser.** Everything the page needs is inside `index.html`: pdf.js, the parser, the styles and the sample report. Nothing from a report is ever sent anywhere, and the page works offline.
- **The only thing sent: anonymous counts.** `src/telemetry.js` sends fixed names to GoatCounter (no cookies): a visit, "summary" when a report has been summarized, and "rating-1" to "rating-5" from the star prompt. It reads back one number, how many reports have been summarized, for the first page. It is off until a GoatCounter site code is set in `package.json` (`"goatcounter"`). The Chrome extension leaves it out.
- **Enforced by the browser.** The page's Content-Security-Policy blocks every outgoing connection except that one GoatCounter host (`default-src 'none'`; `connect-src` and `img-src` name only it, or `'none'` while the code is empty). Scripts run only if their hash matches the build, so a script added later without a rebuild won't run.
- **Almost nothing stored.** No cookies or IndexedDB. The only localStorage entry is `constellation-rated`, so the star prompt doesn't come back once answered. Closing the tab or clicking "Summarize another report" clears the report, which matters for advisors on shared computers.
- **Feedback goes to a USC Google Form.** `feedback.html` is a separate page with three fields: message, optional name, optional email. Pressing Send posts only those fields to a Google Form owned by bbh@usc.edu, and the page says so before anyone presses it. Its Content-Security-Policy allows `docs.google.com` and nothing else. The summary page never connects to Google. Until a Form is set in `package.json`, Send opens a pre-filled email in the student's own email app instead. See [Feedback form setup](#feedback-form-setup).
- **Redacted before reading.** The name, student ID, and diploma name and mailing address are removed before parsing, so none of them reach the parser or the summary. The "Original report text" section shows the report exactly as uploaded, personal details included, so it can be checked against STARS. It stays on the screen and is left out of the printout. Whether to show the student's name on the summary, or to stop redacting altogether, is an open team question (see STATUS.md).
- **Never committed.** Reports and anything derived from them (including test expected results) are git-ignored. `npm run check:privacy` also fails if one is tracked or staged, because `.gitignore` doesn't stop `git add -f`.

`npm run check:privacy` checks all of this. It runs as part of `npm test`.

## What's in this repo

| Path | What it is |
| --- | --- |
| `index.html` | The built page (about 1.8 MB, self-contained). Open it in a browser. |
| `src/parser.js` | The STARS parser: report text in, requirement tree, deduplicated course list, and "what's left" list out. |
| `src/format.js` | Pure functions from parsed report to what the page shows and copies: the summary numbers, course lines, the copy-as-text and copy-for-spreadsheet formats, and course history order. |
| `src/app.js` | The page logic: reads a report (PDF, sample, or text from the extension) and renders the summary. |
| `src/extension/` | The Chrome extension's own scripts: `background.js` reads the STARS tab when the button is clicked; `summary.js` hands that text to the page. |
| `dist/extension/` | The built extension. Load it at `chrome://extensions` with "Load unpacked". |
| `dist/sample-stars-page.html` | The fictional sample report as a web page, to try the extension button without a real report. |
| `src/pdftext.js` | PDF to text: runs pdf.js and rebuilds lines. Shared by the page and the test so both run the same code. |
| `src/page.html` | The page template: layout, styles, rendering. |
| `src/sample-report.txt` | The report behind the "Try a sample report" button: Tommy Trojan (ID 12345678), a junior in the invented "Business of Fighting On" BS. It uses real STARS formatting and typical USC courses, with AP credit, a transfer course, a retake, a term in progress and several requirements still needed. The student, major, program code and grades are invented; it is not based on any real or anonymized report. |
| `src/feedback.html`, `src/feedback.js` | The feedback page and the script that posts it to the Google Form. |
| `test/fixture-report.txt` | The earlier synthetic sample ("Data and Society"), kept for the unit tests because it covers most formats the parser handles. |
| `build.js` | Builds `index.html`: inlines everything, bundles pdf.js from `node_modules`, writes the CSP. |
| `scripts/check-privacy.mjs` | The privacy check described above. |
| `test/unit.mjs` | Unit tests on the synthetic fixture, plus a check that the on-page sample reads cleanly: the abbreviation key, the summary numbers, and the exact text each copy action produces. |
| `test/extension.mjs` | Tests the extension's background script with a stand-in for Chrome's APIs. |
| `test/run.mjs` | Runs every PDF in `test/samples/` through the same pipeline as the page. |

## Working on it

```
npm install
npm run build          # after editing anything in src/; builds index.html and dist/extension/
npm test               # builds, runs the privacy check and unit tests, then tests every report in test/samples/
```

pdf.js is pinned to one exact version (`pdfjs-dist` 4.10.38) in `package.json`. The page and the test both use it. Upgrade it on purpose and re-run every report.

## Chrome extension (V2, in testing)

The extension reads the STARS report already open in your browser, so there's no PDF to save and upload.

**Try it:**
1. Run `npm run build`, or download this repo as a ZIP and unzip it.
2. In Chrome, go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `dist/extension` folder.
3. Pin Constellation from the puzzle-piece menu.
4. Open your STARS report and click the Constellation button. The summary opens in a new tab.

   To try it without a real report, open `dist/sample-stars-page.html` first. Chrome only lets extensions read local files if you turn on "Allow access to file URLs" in the extension's details.

**Privacy:**
- **Permissions:** only `activeTab` and `scripting`, with no access to any website until you click the button. The click lets it read that one tab, once.
- **Storage and network:** the report text goes to the summary tab by message and is never stored. Extension pages block every network connection.
- **Same safeguards as the web page:** redaction and the "Couldn't read confidently" notice work the same way, and the summary tab still accepts a PDF.
- **Feedback:** the extension has no feedback page of its own. "Send feedback" opens the website's feedback page in a new tab, so the summary stays open.

`npm run check:privacy` checks the built extension's permissions and policy too.

**Not yet confirmed on a real STARS page.** The PDF is printed from the STARS web page, so the text should match. Check one locally against your own report and never commit what it shows. If the report sits inside a frame from another site, the extension may need a narrow host permission for that site.

## Feedback form setup

The feedback page posts into a Google Form so that messages land in a USC account, not a third-party service. To turn it on (once, signed in as bbh@usc.edu):

1. Create a Google Form with three questions, in this order: **Feedback** (paragraph, required), **Name** (short answer) and **Email** (short answer).
2. In **Settings → Responses**, turn off **Restrict to users in University of Southern California and its trusted organizations** and leave **Collect email addresses** off. The page posts without signing in, so a restricted Form rejects every message. Also turn on **Get email notifications for new responses** (Responses tab, ⋮ menu) so each message arrives at bbh@usc.edu.
3. Click ⋮ → **Get pre-filled link**, type `x` in each field, and click **Get link**. The link looks like `https://docs.google.com/forms/d/e/<FORM_ID>/viewform?entry.111=x&entry.222=x&entry.333=x`.
4. Put those values in `package.json`: `"feedbackForm": { "id": "<FORM_ID>", "message": "111", "name": "222", "email": "333" }`. Then run `npm test` and push.

Google doesn't let another site read the Form's reply, so the page can only tell a network failure from everything else. If the Form is deleted or restricted again, the page still says "Received", so send yourself a test message after any change to the Form. The name and email arrive in the response, not as the reply-to address. Reply from bbh@usc.edu by writing to the email in the response.

## Parser strategy

**Now:** Constellation keeps its own parser in `src/parser.js`. It doesn't import [`stars-parser/`](https://github.com/usc-bbh/next-sem-validator/tree/main/gui/stars-parser).

**Why it's separate:** Constellation needs the full requirement tree: every block and sub-requirement with its STARS status (OK/NO/IP, +/-), "pick N of M" rules, OR alternatives, and course options. That's what powers the checklist and the "what's left" list. `stars-parser/` outputs profile fields (major, GPA, completed courses, flags) for TrojanReg and doesn't produce that tree. Keeping them separate also means a Constellation change can't break RegCheck, which has carried its own copy of `stars-parser/` since the bbh submodule was dropped (next-sem-validator#3, 7 Oct 2026).

**Things to weigh before deciding whether to share:**

- *For sharing:* one parser to fix when STARS changes format; one anonymized test set; no duplicate effort (the lead has already flagged duplicate STARS parsers across repos).
- *Against sharing:* the two tools need different outputs, and RegCheck's release cadence would constrain Constellation. (The OCR fallback that used to count against sharing is being deleted in M0 of Tanzil's rebuild plan, next-sem-validator#4.)
- *Middle options:* (a) share only the redaction and line-rebuilding steps; (b) add requirement-tree output to `stars-parser/` and have Constellation import it; (c) test both parsers against the same anonymized reports and compare the fields they both produce (major, catalog year, GPA, courses), without merging code.
- *Signals it's time to revisit:* `stars-parser/` starts producing requirement blocks (planned for M5 of next-sem-validator#4, with the shape agreed with Natalie); STARS changes format and both parsers need the same fix; or the two disagree on the same report.

Until this is decided, raise parser changes with Tanzil (who owns `stars-parser/`) whenever they touch shared ground, like redaction or line rebuilding.

## Testing now

1. Put the anonymized PDFs in `test/samples/`. That folder is git-ignored; never commit reports or anything generated from them.
2. Run `npm test`. For each report it first checks **redaction**: the name, any 10-digit ID, and every line of the diploma and mailing block must not appear in the parsed result or in the report text the page shows. A failure prints `LEAK` (without printing the values).
3. For a new report it writes `test/expected/<name>.draft.json`: major, catalog year, GPA, major GPA, units (earned, in progress, needed), which fields were redacted, course count, every block's status and its sub-requirement statuses, and the "what's left" list, and everything flagged as unread.
4. Check each draft against the PDF by hand. Then have a second person check it too, so one person's misreading doesn't become the answer key. When it's right, rename it to `<name>.json`.
5. From then on, `npm test` prints PASS or FAIL per report. A failure writes `<name>.actual.json` next to it so you can diff the two.

Expected results stay local too, because they record a real student's major, courses, and GPA. Share them the same way as the anonymized PDFs, never through git.

## More thorough testing later

The current test proves the parser handles a few reports. Before recommending Constellation widely, testing should show it handles the range of reports students actually have. Here's how that would work:

1. **Coverage matrix.** List the dimensions that change a report's structure, then collect at least one anonymized report per cell that matters:
   - school (Dornsife, Marshall, Viterbi, Annenberg, and so on) and degree type (BA, BS)
   - catalog year (older catalogs use older GE rules)
   - GE track: Core Literacies, Thematic Option, and older GE programs
   - transfer credit, AP/IB credit, and foreign language waivers
   - minors, double majors, and progressive degrees
   - substitutions and waivers (RE, RA, CW, UW, RW)
   - repeated, pass/no pass, incomplete, and deleted-credit courses
   - reports from freshmen (mostly "needs") through graduating seniors (mostly "done")

   Keep the matrix in this README with the report name in each cell, so gaps are visible.
2. **Field-level checks.** Replace the single whole-summary comparison with one check per field (units, GPA, each block, each course), so a failure names what broke instead of just saying "FAIL".
3. **Per-course checks.** Check every course's term, code, units, grade, and flags against the PDF, not just the course count.
4. **Cross-checks that need no answer key.** Rules that must hold for any report: every "done" block has no "needs" sub-requirements; units in the course list, minus in-progress, repeated, and deleted-credit courses, match STARS's earned total; every course in a "what's left" option list is a real course code; the page shows every block the parser found.
5. **Side-by-side review.** For each report in the matrix, someone who knows STARS (ideally an advisor) compares the rendered page to the PDF and records disagreements as new test cases.
6. **Stress inputs.** Scanned PDFs, a report printed from a different browser, a partial report (missing "END OF ANALYSIS"), non-STARS PDFs, and very long reports. Each should show a clear message, never a wrong summary.
7. **Compare with `stars-parser/`.** Run both parsers on the same reports and compare the fields both produce. This works whichever way the [open question](#parser-strategy) is decided.

## How it works

1. **Read the PDF.** pdf.js (bundled, running in an in-memory worker) pulls text fragments, which are regrouped into lines by vertical position (`src/pdftext.js`).
2. **Redact.** Name, student ID, and diploma address are removed first. Browser print headers and footers and anonymizer artifacts ("X.XXX", "Lp") are dropped.
3. **Parse.** Sections are split on the `____` rules. The LEGEND at the end of the report is read too, so codes like TR, IN and >P are explained in the report's own words; a code it doesn't define is shown as written. Every status comes from STARS's own codes (OK, NO, IP on blocks; +, -, IP+, IP- on sub-requirements), never from guessing. A sub-requirement with no mark shows as "Not marked", and anything shaped like report data that the parser can't place (a course row it can't read, a section it doesn't recognise) is listed under "Double-check this against your STARS report" at the top of the summary.
4. **Render.** Summary tiles in the order students ask (GPA, units completed, units remaining, transfer and AP units as STARS totals them, requirements left; anything the report doesn't state reads "Not found in report"). Then one card per area (University, Writing and language, General education, School and major, Other), each in its own color, with open areas first and finished ones last behind a star check. Each card shows requirements complete and the units applied there. Every requirement opens with a caret to show where it stands, the courses used, and what's left: the amount STARS says is needed and the courses to choose from. Course codes link to the USC catalogue, and GE categories link to Dornsife's course list for that category. A left-hand menu (a strip at the top on phones) jumps between sections, and "Print or save as PDF" prints everything open, without the original text.
5. **Copy.** Click the GPA or major GPA to copy it. In course history, click a course code to copy the code, or anywhere else on the row to copy one line (`DSCI 353, Data Visualization, 4 units, A, Fall 2025`); course codes a requirement already used copy too, and each "choose from" code has a copy button next to its catalogue link. "Copy as text" and "Copy for spreadsheet" copy the whole course list, the second as tab-separated columns with a header row. Titles STARS cut short are copied with their "…" rather than completed by guessing.

## Tested on

Hand-checked on three anonymized reports during v0.1. That was before the switch from pdf.js 3.11 (loaded from a CDN) to the bundled 4.10, so re-run `npm test` on them.

- AI for Business (BS), catalog Fall 2024
- Psychology (BA), catalog Fall 2026, Thematic Option
- Computational Neuroscience (BS), catalog Fall 2026

Formats handled: Core Literacies and Thematic Option GE, the Dornsife 104-unit and 40-unit department cap blocks, foreign language waivers, multiple major blocks, "pick N of M" categories, sub-requirements with no +/- marker, "OR" alternatives, wrapped course lists, and course ranges.

## Roadmap

- **V1 (this):** a single self-contained web page.
- **V2: Chrome extension (built, in testing).** Same parser and rendering, opened from the browser toolbar on the STARS page. `build.js --extension` writes every script as its own file, because Chrome extensions don't allow inline scripts. See [Chrome extension](#chrome-extension-v2-in-testing).

## Known limits

- Scanned PDFs with no text layer are rejected with a message. OCR would add several megabytes and would need to be bundled, not loaded from a CDN.
- STARS cuts course titles at 29 characters. The page marks them with "…"; full titles need the course catalog.
- `index.html` is about 1.8 MB because pdf.js is inside it. That's the cost of never sending the report anywhere.
- The page is light-only. Colors follow RegCheck. Its fonts (Space Grotesk, Inter) aren't bundled yet, so the device's system sans font stands in.
- Course links use the 2025-26 catalogue (`cur_cat_oid=22` in `src/app.js`). Update it when USC publishes a new catalogue.
- Unofficial. STARS and the student's academic advisor are the source of truth for graduation.
