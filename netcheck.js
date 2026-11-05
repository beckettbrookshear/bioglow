// Network check: school laptops (and some other networks) block websites their filter hasn't approved.
// The simulator itself runs entirely from this site, but a few features reach other websites: Sync and
// Chat talk through a relay, and the Links menu and Help point to other sites. This checks whether each
// of those can be reached from here and turns off whatever can't, saying why, instead of leaving buttons
// that never work. It checks again on every visit, so everything comes back on a network that allows it.
(function () {
  'use strict';

  const RELAY = (window.BioGlowSync && window.BioGlowSync.BROKER) || 'wss://broker.hivemq.com:8884/mqtt';
  const TIMEOUT = 10000;
  const $ = (sel) => document.querySelector(sel);

  // Can a websocket to the relay open? (A filter that blocks it refuses, resets or never answers.)
  function relayReachable() {
    return new Promise((resolve) => {
      let ws, done = false;
      const finish = (ok) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) { /* already closed */ } resolve(ok); };
      const timer = setTimeout(() => finish(false), TIMEOUT);
      try { ws = new WebSocket(RELAY, 'mqtt'); } catch (e) { finish(false); return; }
      ws.onopen = () => finish(true);
      ws.onerror = () => finish(false);
    });
  }

  // Can this website be reached? A blocked one fails to load (or its connection isn't trusted); the
  // answer itself can't be read from here, only whether there was one.
  const siteChecks = {};
  function siteReachable(origin) {
    if (!siteChecks[origin]) {
      siteChecks[origin] = new Promise((resolve) => {
        const ctl = window.AbortController ? new AbortController() : null;
        const timer = setTimeout(() => { if (ctl) ctl.abort(); resolve(false); }, TIMEOUT);
        fetch(origin + '/favicon.ico', { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
          .then(() => { clearTimeout(timer); resolve(true); }, () => { clearTimeout(timer); resolve(false); });
      });
    }
    return siteChecks[origin];
  }

  // a line in the Code tab's console, like the simulator's own messages
  function say(text) {
    const el = document.getElementById('console');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'net-note';
    d.textContent = text;
    el.appendChild(d);
  }

  // ---- Sync and Chat -------------------------------------------------------------------------------
  function relayOff() {
    const main = document.getElementById('main');
    if (window.BioGlowSync && window.BioGlowSync.stop) window.BioGlowSync.stop(); // a saved Sync code stays for next time
    // a class, not `hidden`, so they stay hidden even when Sync or Chat shows them again (see style.css)
    document.body.classList.add('net-no-relay');
    if (main && main.dataset.tab === 'chat') { const first = $('#tabs [data-tab]:not([data-tab=chat])'); if (first) first.click(); }
    say('This network blocks the relay that Sync and Chat use, so they are turned off here. Everything else works. They come back on a network that allows them.');
  }

  // ---- links to other websites ---------------------------------------------------------------------
  let linksChecked = false;
  function checkLinks() {
    if (linksChecked) return;
    linksChecked = true;
    const links = [...document.querySelectorAll('.links-pop a[href^="https://"], .links-help a[href^="https://"], a#openSpike')];
    const origins = [...new Set(links.map((a) => new URL(a.href).origin))];
    Promise.all(origins.map((o) => siteReachable(o).then((ok) => [o, ok]))).then((results) => {
      const blocked = new Set(results.filter(([, ok]) => !ok).map(([o]) => o));
      if (!blocked.size) return;
      for (const a of links) {
        if (!blocked.has(new URL(a.href).origin)) continue;
        (a.closest('li') || a).hidden = true;
      }
      // a group left empty goes too, and each list says why it is shorter
      for (const ul of document.querySelectorAll('.links-pop ul, .links-help ul')) {
        if ([...ul.children].every((li) => li.hidden)) { ul.hidden = true; if (ul.previousElementSibling && ul.previousElementSibling.tagName === 'H4') ul.previousElementSibling.hidden = true; }
      }
      for (const box of document.querySelectorAll('.links-pop, .links-help')) {
        if (box.querySelector('.net-note')) continue;
        const p = document.createElement('p');
        p.className = 'net-note';
        p.textContent = 'Links to websites this network blocks are hidden.';
        const after = box.querySelector('summary');
        if (after) after.after(p); else box.prepend(p);
      }
    });
  }

  function start() {
    relayReachable().then((ok) => { window.BioGlowNet.relay = ok; if (!ok) relayOff(); });
    // links are only checked once someone looks at them, so the other websites aren't contacted on every visit
    const menu = document.getElementById('linksMenu');
    if (menu) menu.addEventListener('toggle', () => { if (menu.open) checkLinks(); });
    const help = $('#tabs [data-tab=help]');
    if (help) help.addEventListener('click', checkLinks);
    if (document.getElementById('main') && document.getElementById('main').dataset.tab === 'help') checkLinks();
  }

  window.BioGlowNet = { relay: null, siteReachable, checkLinks };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
