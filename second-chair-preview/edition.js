/* Preview edition: runs entirely on this device, sample deck only. */
window.SC_STATIC = true; window.SC_EDITION = { demo: true };
document.addEventListener('DOMContentLoaded', function () {
  var s = document.createElement('style');
  s.textContent = '#fill,#wake{display:none!important}'
    + '.sc-wm{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 18px);z-index:99;display:flex;gap:10px;align-items:center;padding:6px 8px 6px 14px;border-radius:20px;background:rgba(23,22,28,.86);color:#fff;font:600 13px Inter,system-ui,sans-serif;white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,.25)}'
    + '.sc-wm a{color:#17161C;background:#fff;border-radius:14px;padding:5px 11px;text-decoration:none}'
    + '@media (max-width:700px){.sc-wm{left:auto;right:62px;transform:none;top:calc(env(safe-area-inset-top) + 4px);font-size:12px;padding:5px 6px 5px 11px}}'
    + '.preview::after{content:"PREVIEW · vincentbish.com";position:absolute;inset:0;display:grid;place-items:center;font:700 clamp(18px,3.4vw,42px) Inter,system-ui,sans-serif;letter-spacing:.12em;color:rgba(255,255,255,.55);text-shadow:0 0 12px rgba(0,0,0,.35);transform:rotate(-12deg);pointer-events:none;z-index:4}';
  document.head.appendChild(s);
  var b = document.createElement('div'); b.className = 'sc-wm';
  b.innerHTML = 'Preview · vincentbish.com <a href="https://6622888999216.gumroad.com/l/second-chair" target="_blank" rel="noopener">Get Second Chair</a>';
  document.body.appendChild(b);
});
