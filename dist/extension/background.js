// Constellation extension: when the student clicks the toolbar button, read the STARS report open in
// that tab and show the summary in a new tab. The extension has no host permissions: the click grants
// one-time access to the current tab (activeTab), and nothing is read before or after it. The text is
// handed to the summary tab by message and kept only in memory until then. Nothing is stored.

// The report text, by one-time key, until the summary tab opened with that key asks for it.
const waiting = new Map();
const STARS = /STARS - DEGREE PROGRESS REPORT|PREPARED:/;

// Runs inside the STARS tab. The report is fixed-width text; a <pre> keeps its spacing exactly.
function readReport() {
  const pres = [...document.querySelectorAll('pre')];
  const text = pres.length ? pres.map(p => p.innerText).join('\n') : (document.body ? document.body.innerText : '');
  return text.length > 2000000 ? '' : text;
}

async function readTab(tabId) {
  let results;
  try { results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: readReport }); }
  catch (e) {
    // Some frames may be off limits (another site, a browser page). Fall back to the main frame alone.
    try { results = await chrome.scripting.executeScript({ target: { tabId }, func: readReport }); }
    catch (e2) { return { error: "Constellation can't read that tab. Open your STARS report in the browser and click the button again, or upload the PDF below." }; }
  }
  const found = results.map(r => r && r.result).find(t => t && STARS.test(t));
  if (!found) return { error: "That tab doesn't show a STARS report. Open your STARS report and click the Constellation button again, or upload the PDF below." };
  return { text: found };
}

chrome.action.onClicked.addListener(async tab => {
  const result = await readTab(tab.id);
  // Keyed before the tab opens, so the summary can never ask before its report is ready.
  const key = crypto.randomUUID();
  waiting.set(key, result);
  setTimeout(() => waiting.delete(key), 60000); // a tab that never asks doesn't keep the report around
  await chrome.tabs.create({ url: chrome.runtime.getURL('summary.html') + '#' + key, index: tab.index + 1 });
});

// The summary tab asks once for its report. Handing it over also forgets it here.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'constellation:get-report') return;
  const result = waiting.get(msg.key) || null;
  waiting.delete(msg.key);
  reply(result);
});

if (typeof module !== 'undefined') module.exports = { readReport, readTab, waiting };
