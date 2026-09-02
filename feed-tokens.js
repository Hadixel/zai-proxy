// feed-tokens.js — mint fresh Aliyun device tokens from YOUR logged-in
// chat.z.ai tab and feed them to your local zai-proxy.
//
// Paste this whole file into the console (F12) on https://chat.z.ai, Enter.
// It logs every step. Refresh the tab to stop.
(async () => {
  const API = 'http://localhost:3007/admin/tokens';
  const KEY = 'zai-db7538a330c1cee5b1aeb249d2837760c88a5d19ecfd54bf'; // your AUTH_TOKEN
  const log = m => console.log('%c[feeder] ' + m, 'color:#0a0');

  const seen = new Set();
  const batch = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: batch.splice(0) }),
      });
      const d = await r.json();
      if (d.error) { console.warn('[feeder] proxy said:', d.error); return; }
      total += d.inserted || 0;
      log(`+${d.inserted} new (dup ${d.duplicates}) — run total: ${total}, proxy stock: ${d.stock}`);
    } catch (e) {
      console.warn('[feeder] POST to proxy failed (is zai-proxy running?):', e.message);
    }
  };
  const isToken = t => typeof t === 'string' && t.startsWith('U0dfV0VC');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getUm = () => window.z_um || window.um;

  // Step 1: if the page already has a working device module, use it.
  log('step 1/3: looking for the page captcha SDK (z_um/um)…');
  for (let i = 0; !((getUm() || {}).getToken) && i < 15; i++) await sleep(1000);

  // Step 2: initialize the SDK ourselves with chat.z.ai's exact config.
  if (!((getUm() || {}).getToken)) {
    log('not found — loading AliyunCaptcha.js and initializing…');
    try {
      if (!window.initAliyunCaptcha) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
          s.onload = res;
          s.onerror = () => rej(new Error('script load failed (network/CSP?)'));
          document.head.appendChild(s);
        });
        log('AliyunCaptcha.js loaded');
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
      log('initAliyunCaptcha called — waiting for the device module (FeiLin)…');
    } catch (e) {
      console.warn('[feeder] SDK init failed:', e.message);
    }
    for (let i = 0; !((getUm() || {}).getToken) && i < 30; i++) {
      if (i === 10) log('still waiting on FeiLin… device endpoint may be slow');
      await sleep(1000);
    }
  }

  // Step 3: mint. Detect the SDK's degraded fallback (getToken → "").
  const um = getUm();
  if (!(um && um.getToken)) {
    console.warn('[feeder] FAILED: device module never appeared. Send one chat message on the page, wait 10s, re-run.');
    return;
  }
  let emptyStrikes = 0;
  log('device module ready — minting (~75/min). Refresh the tab to stop.');
  for (;;) {
    try {
      const t = um.getToken();
      if (isToken(t) && !seen.has(t)) { seen.add(t); batch.push(t); }
      else if (typeof t === 'string' && t === '') {
        if (++emptyStrikes === 1 || emptyStrikes % 15 === 0)
          console.warn('[feeder] getToken() returns "" — device init failed inside the SDK (FeiLin endpoint blocked?). Reload the page and re-run.');
      }
    } catch (e) { /* transient */ }
    if (batch.length >= 50) await flush();
    await sleep(800);
  }
})();
