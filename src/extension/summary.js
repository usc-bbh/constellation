// Constellation extension, summary tab: ask the background for the report it read from the STARS tab,
// then summarize it. Opened any other way, the tab shows the normal upload screen.
(() => {
  const key = location.hash.slice(1);
  // Drop the key from the address bar: it's single-use, and a reload should show the upload screen.
  if (key) history.replaceState(null, '', location.pathname);
  if (key) chrome.runtime.sendMessage({ type: 'constellation:get-report', key }, result => {
    if (chrome.runtime.lastError || !result) return;
    if (result.text) window.Constellation.run(result.text);
    else if (result.error) window.Constellation.showErr(result.error);
  });
})();
