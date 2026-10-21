// Feedback page: sends the form to the BBH team through a USC Google Form owned by bbh@usc.edu,
// whose new-response emails go to that address. Only the three fields below are sent. The Form
// and its field IDs are set in package.json ("feedbackForm") and filled in by build.js. While they
// are empty, Send opens the student's own email app with the message filled in instead.
(() => {
  const TO = 'bbh@usc.edu';
  const FORM = { id: '__FEEDBACK_FORM_ID__', msg: '__FEEDBACK_MSG__', name: '__FEEDBACK_NAME__', email: '__FEEDBACK_EMAIL__' };
  const on = /^[\w-]{20,}$/.test(FORM.id) && [FORM.msg, FORM.name, FORM.email].every(f => /^\d+$/.test(f));
  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  function mailto() {
    const lines = [val('msg')];
    if (val('name') || val('email')) lines.push('', '--');
    if (val('name')) lines.push('Name: ' + val('name'));
    if (val('email')) lines.push('Reply to: ' + val('email'));
    return 'mailto:' + TO + '?subject=' + encodeURIComponent('Constellation feedback') + '&body=' + encodeURIComponent(lines.join('\n'));
  }
  if (!on) $('note').textContent = 'Pressing Send opens a message to bbh@usc.edu in your own email app, and you choose whether to send it. Name and email are optional. Please don\'t paste your student ID or your STARS report.';

  function done() {
    $('fb').classList.add('hidden');
    $('note').classList.add('hidden');
    $('sent').classList.remove('hidden');
    $('sent').focus();
  }
  function failed() {
    const e = $('err');
    e.innerHTML = 'Couldn\'t send. <a id="mail">Email bbh@usc.edu directly</a>.';
    $('mail').href = mailto();
    e.classList.remove('hidden');
  }

  $('fb').addEventListener('submit', async e => {
    e.preventDefault();
    $('err').classList.add('hidden');
    if (!val('msg')) { $('msg').reportValidity(); $('msg').focus(); return; }
    if (!$('email').checkValidity()) { $('email').reportValidity(); $('email').focus(); return; }
    if (val('website')) { done(); return; }
    if (!on) { location.href = mailto(); return; }
    const body = new URLSearchParams();
    body.set('entry.' + FORM.msg, val('msg'));
    body.set('entry.' + FORM.name, val('name'));
    body.set('entry.' + FORM.email, val('email'));
    const send = $('send');
    send.disabled = true; send.textContent = 'Sending…';
    try {
      // Google Forms doesn't answer cross-site reads, so the reply is opaque: a network failure
      // throws, anything else counts as sent.
      await fetch('https://docs.google.com/forms/d/e/' + FORM.id + '/formResponse', {
        method: 'POST', mode: 'no-cors', body, credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      done();
    } catch (err) {
      failed();
    } finally {
      send.disabled = false; send.textContent = 'Send';
    }
  });
})();
