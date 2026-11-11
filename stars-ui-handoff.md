# Handoff: STARS Report Tool — UI Changes from Advisor Feedback

## Context

The STARS report tool takes a student's USC STARS report (uploaded as a PDF, or read directly from the STARS page by the Chrome extension) and shows a simplified breakdown: GPA, units, requirements left, GE categories, progress by area, and course history. Everything is processed locally in the browser. ~~The only network request is the Google Doc on the feedback page.~~

> **Correction (checked against `src/telemetry.js`, 10 Nov 2026):** the feedback page is not the only network request.
> - **Website:** `src/telemetry.js` sends GoatCounter one-pixel requests with fixed labels only (`/` for a visit, `summary` when a report is summarized, `rating-1` to `rating-5`) and fetches `/counter/summary.json` to show "N reports summarized". Nothing from a report is sent, and there are no cookies, but GoatCounter sees the visitor's IP address and browser type. It is **off today** because `package.json` `"goatcounter"` is empty, and `build.js` then sets `connect-src 'none'`. It turns on as soon as a site code is filled in.
> - **Feedback page:** a Google **Form** (not a Doc) in an iframe, from `package.json` `"feedbackForm"`, inserted by `build.js` at `<!--FORM-->`. Google sees what is typed and may set cookies.
> - **Extension:** no network requests. `build.js` leaves `telemetry.js` out and sets `connect-src 'none'`. Its feedback link opens the live website's feedback page in a new tab.
> - **Never sent:** the report. pdf.js and its worker are bundled, so reading a PDF makes no request. Catalogue and Dornsife GE links are plain links the student clicks.

Steve Asipyan, a Marshall undergraduate advisor, reviewed the tool. He said it is clean and usable as it stands. This handoff covers only the **UI changes** that came out of his review. Parser and accuracy work is listed under "Out of scope" so it doesn't get mixed in here.

## Where things live

All paths are in `~/Documents/constellation` (the copy under `bbh-course-reg-project` is outdated). `build.js` inlines `src/*` into `index.html`, `privacy.html` and `feedback.html` at the repo root, and builds the extension into `dist/extension/` (its `summary.html` is `src/page.html` with each script as a separate file).

| File | What it holds |
|---|---|
| `src/page.html` | Upload screen (intake), privacy line next to the upload box (`p.local`), "More about Constellation", rating prompt, footer. The extension's new tab is this same page. |
| `src/app.js` | Everything on the summary page: `render()` (hero tiles, sections), `areaCard()` / `reqRow()` / `subMore()` / `needBox()` (Progress by area), `sideNav()`, course history table, "GE and unit rules" list. |
| `src/format.js` | `areaView()` (groups requirements into areas and counts them), `deriveSummary()` (tiles), `groupCourses()` (course history). |
| `src/parser.js` | Reads STARS text. `classify()` decides each requirement's name and area; `whatsLeft()` builds the "still needed" rows. |
| `src/style.css` | All styles. Progress by area is under `/* progress by area */`. |
| `src/sample-report.txt` | The report behind "Try a sample report". |
| `src/privacy.html` | Privacy policy page. |
| `src/feedback.html` | Feedback page (form inserted by `build.js`). |
| `src/telemetry.js` | GoatCounter counts and the star rating (website only). |
| `src/extension/background.js`, `src/extension/summary.js` | Extension: reads the STARS tab, hands the text to the summary tab. No UI copy of their own. |
| `test/unit.mjs` | Unit tests, including one that pins the sample report's numbers. |
| `README.md`, `CONTEXT.md`, `store/LISTING.md` | Describe the sample report and the privacy story; update with the code. |

## Goal

Make the information advisors and students look for easiest to find and hardest to misread, without changing what already works.

## Do not change (praised in review)

- The at-a-glance summary at the top: GPA, units, requirements left. *(`src/app.js` `render()`, hero `.tiles`; numbers from `src/format.js` `deriveSummary()`)*
- The USC GPA highlight. It is the GPA most programs use, so keep it the most prominent one. *(`.tile.gpa` in `src/app.js` and `src/style.css`)*
- The GE category breakdown. *(the "General education" area card: `src/format.js` `areaView()`, `src/app.js` `areaCard()`)*
- The course history layout. *(`src/app.js` `render()`, `#history` section)*
- The "units only" tag on courses that count toward the 128 units but are not a major requirement or a GE. *(`src/app.js`, "Counts toward" column)*
- The advisor disclaimer at the top of the page. *(`p.official` in the footer of `src/page.html`, `src/privacy.html`, `src/feedback.html`)*

## Changes

### 1. Replace the sample report (P0) — done

**Problem:** The demo uses a made-up major ("Business of Fighting On", BFON). It confused the advisor, who couldn't tell whether courses like FB 400 were real requirements or sample artifacts.

**Change:** Replace it with a realistic, anonymized sample for the general **Business Administration (BUAD)** major. That major exercises every section: GEs, major core, Marshall electives and free electives.

**Acceptance criteria:**
- The sample student's major is BUAD, and the course codes are real Marshall/USC courses.
- The sample shows at least one of each: completed GE, missing GE, in-progress course, Marshall elective, free elective ("units only"), and a remaining major requirement.
- No real student data. The name is clearly fictional.
- If the UI says anything about "sample", it says something like "This is a sample BUAD report", not a fake major name.

**Files:** `src/sample-report.txt` (the report), `src/app.js` (`#sample` click handler → `run()`; no sample notice: per Natalie, the sample is simply replaced and the summary doesn't call it out), `src/parser.js` (`sentence()` keeps "Marshall" capitalized), `test/unit.mjs` (pinned sample numbers), `README.md` and `CONTEXT.md` (describe the sample), `store/LISTING.md` (screenshots were made from the old sample and need retaking), `build.js` (`dist/sample-stars-page.html` is built from the sample; no change needed).

### 2. Make major requirements easy to find (P0) — done

**Problem:** Major requirements are nested several levels deep: "School & Major" → "2 needed" → "Major requirements", each behind a caret. The advisor couldn't find them at all without help.

**Change:** Give major requirements their own top-level spot in "Progress by area", on the same level as GEs, rather than buried inside "School & Major".

**Acceptance criteria:**
- Major requirements can be seen without expanding more than one level.
- The section header shows the count remaining, e.g. "Major requirements · 3 left".
- The STARS hierarchy is still correct; this only changes how it's displayed.

**Files:** `src/format.js` `areaView()` (split the `major` blocks out of "School and major" into their own area; the parser's `group` stays as it is), `src/app.js` (`areaCard()`, new `partRow()`, `sideNav()` area links), `src/style.css`, `test/unit.mjs`.

### 3. Add a GE double-count note (P0) — done

**Problem:** One of the most common questions advisors get is which GEs double count. The UI doesn't explain it anywhere.

**Change:** Add a short, persistent note in the GE section, e.g.:
> Courses in Core categories A, B and C can also count toward Global Perspectives categories G and H.

**Acceptance criteria:**
- The note is in the GE section, visible without hovering or expanding.
- When one course satisfies two GE categories, both categories show that course, and it's marked as double-counted.
- **Before shipping, confirm the exact wording with Steve or the official GE policy.** The rule above is as he stated it on the call.

**Files:** `src/app.js` (`areaCard()` note for the General education area; `subMore()` marks double-counted course chips; the existing "GE and unit rules STARS applies" list in `render()` has a related line that should match the confirmed wording), `src/format.js` (`areaView()` finds courses applied to both a Core Literacies part and a Global Perspectives part), `src/style.css`.

> **Wording settled (10 Nov 2026):** Steve said Core categories A, B and C only, but STARS itself prints "A COURSE MAY APPLY TO BOTH A CORE LITERACY REQUIREMENT AND A GLOBAL PERSPECTIVES REQUIREMENT", and the existing "GE and unit rules" list says the same. The note follows STARS: *"A course in any Core Literacy category can also count toward Global Perspectives (G or H)."* (`GE_DOUBLE_NOTE` in `src/app.js`). The double-count tags follow what STARS actually applied, so they don't depend on the wording. Worth mentioning to Steve when he sends his feedback after the 18th.

### 4. Show completed major courses, not just remaining ones (P1)

**Problem:** "Progress by area" only lists what's still needed. The advisor asked where completed core courses (e.g. BUAD 302, 304, 351) show up. Right now the only answer is course history.

**Change:** In each requirement area, show the completed courses too, collapsed or visually de-emphasized beneath what's remaining.

**Acceptance criteria:**
- Each area shows "X of Y complete", and completed courses can be revealed inline.
- Remaining items stay the visual focus.
- Use the same colors as STARS: missing = red, in progress / complete = blue. Or document why the tool uses its own scheme.

**Files:** `src/app.js` (`areaCard()`, `counts()`, `reqRow()`, `partRow()`, `subMore()` — completed parts already list their course chips, but only behind the "complete" count), `src/format.js` (`areaView()` counts), `src/style.css` (`--done`, `--prog`, `--needs` colour tokens and `.mk` dots).

### 5. Clarify privacy copy (P1)

**Problem:** Advisors will be loading real student reports, and the advisor specifically asked whether reports are saved. The copy needs to answer that clearly.

**Change:** Where the tool talks about privacy (the upload area, the extension's new tab, and the feedback page), say clearly that:
- the report is processed **in your browser** and never uploaded or stored by us;
- ~~the only data sent anywhere is what you choose to submit on the feedback page.~~ **Not true once GoatCounter is on** (see the correction under Context). Say instead that nothing from the report is ever sent; the website may send anonymous visit/summary/rating counts; the extension sends nothing; and the feedback form goes to Google.

**Acceptance criteria:**
- The copy doesn't say "server-side". Processing is client-side and local.
- A short version of the statement is visible next to the upload button / at the top of the extension tab.

**Files:** `src/page.html` (`p.local` next to the upload box, which is also the top of the extension tab; "Private by design" in "More about Constellation"), `src/feedback.html` (lede above the form), `src/privacy.html` (full policy; already describes GoatCounter accurately), `src/telemetry.js` (header comment is the source of truth for what is sent), `store/LISTING.md` (store privacy text), `README.md` ("The report stays in the browser").

### 6. Label emphases and integrated electives clearly (P2: depends on parser work)

**Problem:** Declaring a Marshall emphasis (e.g. finance) changes the STARS section from "Marshall electives" to an emphasis, and can add a course. BUAI lists major-required electives under "integrated…" language. If the UI just copies the STARS labels, students won't understand what they're looking at.

**Change:** Show the declared emphasis by name, with a count ("Finance emphasis · 4 courses, 2 left"). Label BUAI integrated courses as "Major-required electives", with the original STARS label shown in secondary text.

**Acceptance criteria:**
- The UI can show both states: no emphasis ("Marshall electives · 3") and emphasis declared ("<Emphasis> emphasis · N").
- The original STARS label is always visible somewhere, so advisors can cross-reference it.
- Blocked until the parser handles emphases (see Out of scope).

**Files:** `src/parser.js` (`classify()` and the part names from `sentence()`; blocked parser work), `src/app.js` (`partRow()` already shows the original STARS label as secondary text), `src/format.js` (`areaView()`).

## Out of scope for this handoff

- **Parser accuracy** for declared emphases, BUAI integrated electives, and non-Marshall majors (English, Annenberg, etc.). This needs real test reports and is its own piece of work.
- **Freshman-friendly "course plan" view.** Steve thinks freshmen may still prefer a course plan that lists exactly what to take. This is worth exploring later, but it's a new feature, not a change to the current UI.
- **Chrome extension flow.** Steve approved it as it is. The only change is the privacy copy in #5.

## Pending input

Steve is testing with real STARS reports, with and without emphases, and will send issues by email. He'll give fuller feedback after the 18th. Add any UI issues he reports to this list.

### Notes from Natalie (10 Nov), to clarify

- **Done (10 Nov):** Course history now opens with a **Future** section listing everything STARS still shows as needed (the same rows as the "Requirements left" tile), above the terms. *(`src/app.js` `render()`, `#history`; `src/style.css` `tr.fut`)*
- **Done (10 Nov):** "Progress by area" is now **"Requirement progress by area"**, in the heading and the side menu. *(`src/app.js` `render()`, `sideNav()`)*
- **Getting Constellation to people:** send it to people; GoatCounter (still off: `package.json` `"goatcounter"` is empty); "more"; the extension (the "Add to Chrome" promo in `src/page.html` still links to `#`).
