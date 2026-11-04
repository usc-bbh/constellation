# Chrome Web Store listing

Everything to paste into the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) for Constellation, plus the steps. The upload itself has to be done by a person signed in to the BBH Google account.

## Before the first upload

1. **Developer account.** Sign in as bbh@usc.edu, register as a Chrome Web Store developer and pay the one-time $5 fee. Verify the contact email. When asked, declare BBH a **non-trader** (a student group, not selling anything).
2. **Privacy policy live.** Check that https://usc-bbh.github.io/constellation/privacy.html loads. The listing links to it.
3. **Build the zip.** In this folder, run:

   ```
   npm run package:extension
   ```

   It runs the tests and writes `dist/constellation-extension-<version>.zip`. The version comes from `package.json`. Every new upload needs a higher version than the last.

## Package

Upload `dist/constellation-extension-0.3.0.zip` under **Package > Upload new package**.

## Store listing tab

**Name:** Constellation (filled in from the manifest)

**Summary** (from the manifest, 132 characters max):
> Make sense of your STARS. Summarizes the STARS report open in your browser. Nothing leaves your device.

**Description:**
> Constellation turns your USC STARS degree progress report into a short, readable summary.
>
> Open your STARS report in Chrome and click the Constellation button. A new tab shows:
> • your USC GPA and major GPA
> • units done, in progress and still needed
> • how many requirements are left
> • each area (University, GE, your major, writing) with what's needed, what's in progress and what's complete
>
> Click a count to see those requirements. Open one to see the courses that count and what you can take next, with links to the USC catalogue and Dornsife's GE lists. You can copy your GPA, course codes or your whole course list, and print the summary or save it as a PDF.
>
> Private by design: Constellation reads only the tab you click it on, only when you click. It makes no network requests and stores nothing. Your report stays on your computer.
>
> Constellation is built by BUAI Builder Hub, a USC student group. It is not an official USC system. Always confirm in STARS and with your advisor.
>
> Have your report as a PDF instead? Upload it at usc-bbh.github.io/constellation for the same summary.

**Category:** Education (under Productivity)

**Language:** English

**Store icon:** `store/icon-128.png`

**Screenshots** (1280×800, made from the fictional Tommy Trojan sample, no real student data):
1. `store/screenshot-1-summary.png`: the summary, with GPA, units and requirements left
2. `store/screenshot-2-area-open.png`: an area opened to what's needed, with course links

**Small promo tile** (440×280): `store/promo-small-440x280.png`

**Homepage URL:** https://usc-bbh.github.io/constellation/

**Support URL:** https://usc-bbh.github.io/constellation/feedback.html

## Privacy tab

**Single purpose:**
> Summarize the USC STARS degree progress report open in the current tab, so a student can see what's done, in progress and left.

**Permission justifications:**
- **activeTab:** When the student clicks the toolbar button, Constellation reads that one tab to find the STARS report text. It never reads other tabs or reads anything without a click.
- **scripting:** Constellation uses it to run one small function in the tab the student clicked on. The function copies out the report text, checking the page's frames too, since STARS can show the report inside one. Constellation runs nothing anywhere else.

**Remote code:** No, I am not using remote code. All code ships in the package.

**Data usage:** Check none of the data types. The extension collects no user data: the report text is passed once to the summary tab in memory and never stored or sent.

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://usc-bbh.github.io/constellation/privacy.html

## Distribution tab

- **Visibility:** Unlisted until the advisor and mentor reviews are done (anyone with the link can install it), then Public.
- **Regions:** All regions.

## After it's approved

1. Copy the listing's URL (`https://chromewebstore.google.com/detail/constellation/<id>`).
2. Put it in `src/page.html` in place of `#` on the **Add to Chrome** button, run `npm test`, and push.
3. Note the version and date under "Releases" below.

Review usually takes a few days. A reviewer may ask why `scripting` reads all frames; the justification above answers it.

## Releases

| Version | Date | Notes |
|---|---|---|
| 0.3.0 | not yet submitted | First store upload |
