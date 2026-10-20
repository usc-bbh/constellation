// Feedback page: builds an email to the BBH team from the form. Nothing is sent from the page; the
// student's own email app opens with the message filled in.
(() => {
  const TO = 'bbh@usc.edu';
  const $ = id => document.getElementById(id);
  function href() {
    const lines = [$('msg').value.trim()];
    const name = $('name').value.trim(), email = $('email').value.trim();
    if (name || email) lines.push('', '--');
    if (name) lines.push('Name: ' + name);
    if (email) lines.push('Reply to: ' + email);
    return 'mailto:' + TO + '?subject=' + encodeURIComponent('Constellation feedback') + '&body=' + encodeURIComponent(lines.join('\n'));
  }
  ['msg', 'name', 'email'].forEach(id => $(id).addEventListener('input', () => { $('send').href = href(); }));
  $('send').addEventListener('click', e => {
    if (!$('msg').value.trim()) { e.preventDefault(); $('msg').reportValidity(); $('msg').focus(); return; }
    $('send').href = href();
  });
  $('fb').addEventListener('submit', e => { e.preventDefault(); $('send').click(); });
})();
