// feed-tokens.js — mint fresh Aliyun device tokens from YOUR logged-in
// chat.z.ai tab and feed them to your local zai-proxy.
//
// How to use:
//   1. Open https://chat.z.ai in your browser (logged in).
//   2. Open DevTools console (F12) and paste this whole file, Enter.
//   3. It loads the site's own captcha SDK if needed, then mints tokens
//      (~75/min). Refresh the tab to stop.
//   4. Check stock any time: curl http://localhost:3007/admin/tokens \
//        -H "Authorization: Bearer <your AUTH_TOKEN>"
//
// The proxy spends one token per completion, so keep the stock above a few
// dozen. Re-run this snippet whenever stock runs low (tokens expire in days).
(async () => {
  const API = 'http://localhost:3007/admin/tokens';
  const KEY = 'zai-db7538a330c1cee5b1aeb249d2837760c88a5d19ecfd54bf'; // your AUTH_TOKEN

  // Feed function
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
  const isToken = t => typeof t === 'string' && t.startsWith('U0dfV0VC');

  // Step 1: get the SDK's device-token module (window.z_um / window.um).
  let um = window.z_um || window.um;
  for (let i = 0; !(um && um.getToken) && i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    um = window.z_um || window.um;
  }

  // Step 2: if the page never initialized the captcha SDK, do it ourselves
  // with the exact config chat.z.ai uses (same region/prefix/scene).
  if (!(um && um.getToken)) {
    console.log('captcha SDK not initialized by the page — initializing…');
    try {
      if (!window.initAliyunCaptcha) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
          s.onload = res;
          s.onerror = () => rej(new Error('captcha script failed to load'));
          document.head.appendChild(s);
        });
      }
      window.AliyunCaptchaConfig = { region: 'sgp', prefix: 'no8xfe' };
      let el = document.getElementById('__tokenFeeder');
      if (!el) {
        el = document.createElement('div');
        el.id = '__tokenFeeder';
        el.style.cssText = 'position:fixed;left:-9999px;bottom:0;width:320px;height:40px;';
        document.body.appendChild(el);
      }
      window.initAliyunCaptcha({
        SceneId: 'didk33e0',
        mode: 'embed',
        element: '#__tokenFeeder',
        region: 'sgp',
        prefix: 'no8xfe',
        language: 'en',
        captchaVerifyCallback: async () => ({ captchaResult: true }),
        onBizResultCallback: () => {},
      });
    } catch (e) {
      console.warn('SDK init failed:', e.message);
    }
    for (let i = 0; !((window.z_um || window.um) || {}).getToken && i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
    }
    um = window.z_um || window.um;
  }

  if (!(um && um.getToken)) {
    console.warn('device-token module never appeared. Send one message in the chat, wait 10s, then re-run this snippet.');
    return;
  }
  console.log('device-token module ready — minting… refresh the tab to stop.');

  for (;;) {
    try {
      const t = um.getToken();
      if (isToken(t) && !seen.has(t)) { seen.add(t); batch.push(t); }
    } catch (e) { /* transient; keep going */ }
    if (batch.length >= 50) await flush();
    await new Promise(r => setTimeout(r, 800));
  }
})();
