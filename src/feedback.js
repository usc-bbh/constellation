// Feedback page: the email fallback. When a Google Form is set in package.json ("feedbackForm"),
// build.js embeds it above this form and the Form's own page takes the feedback. This script only
// builds an email to the BBH team; nothing is sent from the page. The student's own email app opens
// with the message filled in.
(() => {
  const TO = 'bbh@usc.edu';
  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  function mailto() {
    const lines = [val('msg')];
    if (val('name') || val('email')) lines.push('', '--');
    if (val('name')) lines.push('Name: ' + val('name'));
    if (val('email')) lines.push('Reply to: ' + val('email'));
    return 'mailto:' + TO + '?subject=' + encodeURIComponent('Constellation feedback') + '&body=' + encodeURIComponent(lines.join('\n'));
  }
  $('fb').addEventListener('submit', e => {
    e.preventDefault();
    if (!val('msg')) { $('msg').reportValidity(); $('msg').focus(); return; }
    if (!$('email').checkValidity()) { $('email').reportValidity(); $('email').focus(); return; }
    location.href = mailto();
  });
})();
