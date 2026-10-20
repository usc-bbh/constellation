// Constellation usage counts and the star rating. Web page only: the Chrome extension leaves this
// file out and stays offline.
//
// This is the only code that talks to the network, and it sends nothing from a STARS report. It
// sends only these fixed names to GoatCounter (no cookies): "/" for a visit, "summary" when a
// report has been summarized, and "rating-1" to "rating-5". It reads back one number, how many
// reports have been summarized, to show on the first page.
//
// The GoatCounter site code is set in package.json ("goatcounter") and filled in by build.js.
// While it is empty, nothing is sent and no count is shown. build.js allows exactly that host in
// the page's Content-Security-Policy.
(() => {
  const SITE = '__GOATCOUNTER_SITE__';
  const on = /^[a-z0-9-]+$/.test(SITE);
  const base = on ? 'https://' + SITE + '.goatcounter.com' : '';

  // A one-pixel image request. Images need no connect permission and carry no cookies.
  function send(path, isEvent) {
    if (!on) return;
    const q = new URLSearchParams({ p: path, t: 'Constellation' });
    if (isEvent) q.set('e', 'true');
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = base + '/count?' + q.toString();
  }

  // "N reports summarized with Constellation", read from GoatCounter's public counter.
  async function showUsage() {
    const el = document.getElementById('usage');
    if (!on || !el) return;
    try {
      const res = await fetch(base + '/counter/summary.json', { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) return;
      const n = String((await res.json()).count || '').replace(/[^\d,]/g, '');
      if (!n || n === '0') return;
      el.innerHTML = `<b>${n}</b> reports summarized with Constellation so far.`;
      el.classList.remove('hidden');
    } catch (e) { /* no count shown */ }
  }

  // The rating prompt at the bottom of the first page. Once a student rates or closes it, it
  // stays closed: the only thing stored is that it was answered.
  const KEY = 'constellation-rated';
  const answered = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* asks again next visit */ } };
  const rate = document.getElementById('rate');
  const intake = document.getElementById('intake');
  function showRate() { if (rate && !answered() && !intake.classList.contains('hidden')) rate.classList.remove('hidden'); }
  function hideRate() { if (rate) rate.classList.add('hidden'); }
  if (rate) {
    rate.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
      send('rating-' + b.dataset.rate, true);
      remember();
      rate.querySelector('#rateQ').textContent = 'Thanks for rating Constellation!';
      rate.querySelector('.stars').remove();
      setTimeout(hideRate, 2500);
    }));
    rate.querySelector('#rateClose').addEventListener('click', () => { remember(); hideRate(); });
    // Back on the first page after "Summarize another report" or the logo.
    new MutationObserver(() => intake.classList.contains('hidden') ? hideRate() : showRate())
      .observe(intake, { attributes: true, attributeFilter: ['class'] });
  }

  window.Telemetry = { summarized() { send('summary', true); } };
  send('/', false);
  showUsage();
  showRate();
})();
