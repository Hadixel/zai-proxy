// feed-tokens.js — mint fresh Aliyun device tokens from YOUR logged-in
// chat.z.ai tab and feed them to your local zai-proxy.
//
// How to use:
//   1. Open https://chat.z.ai in your browser (logged in).
//   2. Send one message in the chat (this loads Aliyun's captcha SDK).
//   3. Open DevTools console (F12) and paste this whole file, Enter.
//   4. Watch it mint tokens (~75/min). Refresh the tab to stop.
//   5. Check stock any time: curl http://localhost:3007/admin/tokens \
//        -H "Authorization: Bearer <your AUTH_TOKEN>"
//
// The proxy spends one token per completion, so keep the stock above a few
// dozen. Re-run this snippet whenever stock runs low (tokens expire in days).
(async () => {
  const API = 'http://localhost:3007/admin/tokens';
  const KEY = 'zai-db7538a330c1cee5b1aeb249d2837760c88a5d19ecfd54bf'; // your AUTH_TOKEN

  let um = window.z_um || window.um;
  for (let i = 0; !(um && um.getToken) && i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    um = window.z_um || window.um;
  }
  if (!(um && um.getToken)) {
    console.warn('z_um not found — send one message in chat.z.ai first, then re-run.');
    return;
  }

  const seen = new Set();
  const batch = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    const r = await fetch(API, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: batch.splice(0) }),
    });
    const d = await r.json();
    if (d.error) return console.warn('proxy said:', d.error);
    total += d.inserted || 0;
    console.log(`+${d.inserted} new (dup ${d.duplicates}) — run total: ${total}, proxy stock: ${d.stock}`);
  };

  console.log('minting device tokens… refresh the tab to stop.');
  for (;;) {
    try {
      const t = um.getToken();
      if (t && !seen.has(t)) { seen.add(t); batch.push(t); }
    } catch (e) { /* transient; keep going */ }
    if (batch.length >= 50) await flush();
    await new Promise(r => setTimeout(r, 800));
  }
})();
