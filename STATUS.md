# Constellation: status and next steps

_Last updated 19 Oct 2026 by Natalie (with Claude). Start here when picking the project back up._

This is the working to-do list for Constellation V1. [README.md](README.md) explains what the project is and how it works. This file tracks what's done, what's left, and what's waiting on whom.

## The goal for V1

1. **Sample report:** a fully synthetic report (STARS formatting, invented courses, grades and terms), so no real record goes into any repo.
2. **Parsing:** map each open question in the STARS walkthrough to how Constellation handles it. Anything it can't read confidently gets flagged on the page instead of guessed. Tanzil reviews the PDF parsing. All 10 anonymized reports pass locally before V1 is called done.
3. **UI:** V1 stays a web page with three views (dashboard, table, printable), built so it can become a Chrome extension in V2. Before V2, check whether the text on the STARS web page matches the PDF text.

## Where things stand

| # | Item | Status |
|---|---|---|
| 1 | Synthetic sample in this repo | **Done.** `src/sample-report.txt` (program 9000, "Data and Society") is invented. |
| 1 | Earlier sample in `bbh-course-reg-project` history | **Open.** The pre-move sample (BS AI for Business, program 1915) is still in that repo's history at commit `2c019dd`. Confirm it was fully invented. If not, ask Vishal about removing it from history (see "Removing the old sample" below). |
| 2 | Flag instead of guess | **Done (13 Oct).** See "What changed on 13 Oct". |
| 2 | Walkthrough mapping | **Not started.** The walkthrough is `docs/reference/01-reading-a-stars-report.md` in `bbh-course-reg-project`. Section 12 of Tanzil's `STARS_PARSER_DESIGN.md` (in next-sem-validator, formerly PLAN.md) lists where real reports contradict it. Start there. |
| 2 | Tanzil's review of PDF parsing | **Not asked yet.** His rebuild plan already covers line rebuilding (see "Related work"). Ask him to look at `redact()` in `src/parser.js`. |
| 2 | 10 anonymized reports | **Not started.** `test/samples/` is empty on this machine. Only 3 reports were ever hand-checked, and that was before pdf.js 4.10. Tanzil has 11 redacted reports. |
| 2 | Line rebuilding (optional) | **Open decision.** Tanzil's fixed-width column method (character width read from the PDF) is more robust than `src/pdftext.js`, which guesses spaces from gaps. Only switch once real reports can confirm it. |
| 3 | Three views | **Done (13 Oct).** Dashboard, Table and Printable tabs. |
| 3 | V2: build that writes scripts as separate files | **Not started.** Chrome Manifest V3 forbids inline scripts. Add a `build.js` mode, and keep the V1 single page unchanged. |
| 3 | V2: STARS web page text vs PDF text | **Not started.** Do this locally with your own report. Don't commit the output. |
| — | README pointed at the old parser location and submodule | **Done on this branch (13 Oct), not on `main` yet.** Tanzil flagged it again in bbh-course-reg-project#7 (18 Oct). Merging this branch closes it. |
| — | Pathwise decisions before Tanzil's M4 | **Open, time-sensitive.** See "Waiting on Natalie (Pathwise)" below. M4 (next-sem-validator#9) is already open. |

## What changed on 13 Oct

- **`src/parser.js`:** anything the parser can't place goes on a new `R.unread` list instead of being dropped or guessed:
  - a section it doesn't recognise that contains data lines
  - a course row or tally it can't read
  - a sub-requirement STARS left unmarked; its status is now `none` and it shows as "Not marked" (it used to be guessed as done or needed)

  Prose notes are still skipped quietly. Also fixed: a course row right under a wrapped heading used to be swallowed into the heading text. The sample report parses exactly as before.
- **`src/page.html`:**
  - A "Couldn't read confidently" notice at the top lists each flagged part.
  - Three views as tabs. Printing from any view prints the Printable version.
  - Checked at phone width and with zero network requests.
- **`test/run.mjs`:** drafts include an `unread` field. Any `test/expected/*.json` made before 13 Oct won't match until you add it.
- **`README.md`:** parser links point to `usc-bbh/next-sem-validator/gui/stars-parser/`, the stale submodule and OCR claims are gone, and the new views and notice are described.

## Next steps, in order

1. **Merge this branch** (`v1-flags-and-views`) into `main` via a PR, then tell Tanzil on bbh-course-reg-project#7 that the README is fixed.
2. **Settle the three Pathwise questions** with Tanzil before his M4 lands (see below).
3. **Ask Tanzil** for the redacted reports and a look at `redact()`.
4. **Decide on the old sample** in `bbh-course-reg-project` history. Check with Vishal if it needs removing.
5. **Walkthrough mapping:** a table with three columns: each open question in doc 01, how Constellation handles it, and whether it's flagged on the page. Claude can draft it.
6. **Run the reports:** put the PDFs in `test/samples/` (git-ignored, never commit them) and run `npm test`. Hand-check each `.draft.json` against its PDF, get a second person to check it, then rename it to `.json`.
7. **Line rebuilding:** decide based on step 6's results.
8. **V2 prep:** separate-scripts build mode, then the web page vs PDF check.

## Reply to Tanzil (posted; folded into his design doc)

> Thanks Tanzil, read through PLAN.md. Two things from the Constellation side:
>
> 1. **M5 requirement shape:** Constellation already builds a requirement tree from the same blocks. Each block has a name, OK/NO/IP status, sub-requirements, courses, notes, earned/needs/in-process and select-from. Each sub-requirement has +/-/IP+/IP- status, OR alternatives, needs, and taken/in-progress counts. Happy to use that as the starting point for M5 so we're not designing it twice. If the shapes line up, Constellation could eventually import your parser instead of keeping its own, which would also take care of the duplicate-parser concern.
> 2. **Small correction:** Constellation moved to its own repo on 30 Sept (usc-bbh/constellation), so "Related work" in section 2 should point there rather than `bbh-course-reg-project/constellation/`. Thanks for the submodule heads-up, I'll update my README.

Other points I held back and may raise later:
- next-sem-validator is public, and the plan commits fixtures built from real redacted reports.
- `CURRENT POST:` may not start its own underscore-split block, so the plan's "required sections present" check could fail on every report.
- The diploma name and address come after `PREPARED:`, so on unredacted uploads they aren't stripped.

## Waiting on Natalie (Pathwise)

Section 11 of `STARS_PARSER_DESIGN.md` lists three things to agree before M4 switches the app to the new parser. Tanzil recommends:

1. **Failed parse:** `parseStarsText()` throws `StarsParseError`, and the public `parseStarsReport(file, options)` catches it and resolves `null`, with the reason sent through `onStatus`. That keeps Pathwise's stub contract.
2. **Transfer labels:** Pathwise switches from `usc` / `transfer_specific` / `transfer_generic` to `usc` / `exam` / `transfer` / `transfer_generic`. The sample student's `ESRM 150` becomes `transfer`, with any USC equivalence in `equivalents`. While doing this, fix the stale `docs/parser-brief.md` references in `uscTerms.ts`, `CourseRow.tsx`, `types.ts`, `sampleStudent.ts`, `contracts.test.ts` and `docs/degree-planner-ui-notes.md` line 121 (from bbh #7).
3. **`fixtures/stars/mock_stars_report.json`:** keep it as a hand-written edge-case fixture, update it to the new shape at M4 in both repos, and add a contract test.

For M5 (requirement blocks starting from Constellation's tree), he asks to:
- keep the raw STARS status codes, because Constellation's `progress` merges `IP+` and `IP-`
- add `+R`, unmarked parts (Constellation now has `none`) and skipped numbering
- give each block a stable `id`

## Related work

- **RegCheck = `usc-bbh/next-sem-validator`** (Agastya, Tanzil). The STARS parser moved there from bbh's `stars-parser/` on 7 Oct (next-sem-validator#3). Tanzil's design is `gui/stars-parser/STARS_PARSER_DESIGN.md` (plan merged in #4, renamed in #5). Build progress: M0–M3 in #8, M4 (switch the app over) in #9, both open as of 19 Oct. The design:
  - It deletes OCR (M0) and adds structured requirement blocks at M5, with the shape to be agreed with Natalie and Francis.
  - It confirms Constellation's line-grouping tolerance.
  - Its `none` status for unmarked sub-requirements matches what Constellation now does.
- **Whether to share one parser** is still open. See "Parser strategy" in the README. M5 is the natural point to revisit it.
- **People:** Vishal (lead; wants short written updates), Tanzil (parser/validator, redaction), Agastya (RegCheck).

## Removing the old sample (only with Vishal's OK)

This rewrites shared history in `bbh-course-reg-project`. Everyone will need to re-clone afterwards.

```
pip install git-filter-repo
git clone https://github.com/usc-bbh/bbh-course-reg-project.git bbh-clean && cd bbh-clean
git filter-repo --path constellation/src/sample-report.txt --invert-paths
git log --all -- constellation/src/sample-report.txt   # should print nothing
git push --force --all
```

GitHub may still serve the old commit by its hash for a while. Ask GitHub support to purge it if that matters.

## Picking this up with Claude

Open Claude Code in `~/Documents/constellation` and say: "Read STATUS.md and continue with the next step."
