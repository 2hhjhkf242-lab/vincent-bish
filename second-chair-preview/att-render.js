/* Renders one slide's attention stage from session state (no navigation, no storage: the session owns that). */
window.AttRender = (function () {
  var intro = {};
  function introOf(id, m) {
    if (intro[id]) return intro[id];
    var map = {};
    m.stages.forEach(function (s, i) { (s.active || []).concat(s.context || []).forEach(function (e) { if (!(e in map)) map[e] = i + 1; }); });
    return (intro[id] = map);
  }

  /* ---------- Quotation words: a stage may carry { words: {...} } ----------
     Settled states never hold inline styles: words are fully visible unless a reveal is in flight.
     A reveal plays only when this slide's stage crossed into the words stage, and is positioned on the shared
     session clock (st.t), so the Mac and the phone run the same frame and a late joiner lands mid-flight or settled. */
  var clock = function () { return Date.now(); };
  var TREAT = {
    ink: { dur: 780, ease: 'cubic-bezier(0.5, 0, 0.25, 1)', ink: 0.1 }   // latent image at 10% ink, develops in place, never moves
  };
  var DEF = { treatment: 'ink', stagger: 90, clear: 330, gap: 120, pauses: {}, turnFrom: -1, turnTo: -1, turnSlow: 90 };

  function split(el) {
    if (el._w) return el._w;
    var nodes = [], tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, idx = -1, glued = false, words = [];
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); glued = false; return; }
        if (!glued) idx++;                         // punctuation touching a word (".”" after a span) moves with that word
        var w = document.createElement('span'); w.className = 'att-w'; w.textContent = p;
        frag.appendChild(w); words.push({ el: w, i: idx }); glued = true;
      });
      node.parentNode.replaceChild(frag, node);
    });
    return (el._w = words);
  }
  function plan(words, c) {
    var t = TREAT[c.treatment] || TREAT.ink, dur = c.duration || t.dur, last = -1, d = 0, at = [], end = 0;
    words.forEach(function (w) {
      if (w.i !== last) { if (last > -1) d += c.stagger; d += (c.pauses[w.i] || 0); last = w.i; }
      var wd = dur + (c.turnFrom > -1 && w.i >= c.turnFrom && (c.turnTo < 0 || w.i < c.turnTo) ? c.turnSlow : 0);
      at.push({ start: c.clear + c.gap + d, dur: wd }); end = Math.max(end, c.clear + c.gap + d + wd);
    });
    return { t: t, at: at, total: end };
  }
  function frames(t, w, a, total, c) {
    var hid = t.hid, fin = t.fin;
    if (t.ink) {
      var col = getComputedStyle(w.el).color, bg = c.paper || [250, 250, 250];
      var m = col.match(/\d+(\.\d+)?/g).map(Number), mix = function (k) { return 'rgb(' + [0, 1, 2].map(function (j) { return Math.round(bg[j] + (m[j] - bg[j]) * k); }).join(',') + ')'; };
      hid = { color: mix(t.ink) }; fin = { color: col };
    }
    var o1 = c.clear / total, o2 = a.start / total;
    return [
      Object.assign({ offset: 0, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }, fin),
      Object.assign({ offset: o1 }, hid),
      Object.assign({ offset: o2, easing: c.ease || t.ease }, hid),
      Object.assign({ offset: (a.start + a.dur) / total }, fin),
      Object.assign({ offset: 1 }, fin)
    ];
  }
  function cancel(el) { (el._anims || []).forEach(function (a) { a.cancel(); }); el._anims = []; }
  function words(section, m, st) {
    m.stages.forEach(function (sg, i) {
      if (!sg.words) return;
      var el = section.querySelector('[data-words="' + sg.words.el + '"]'); if (!el) return;
      var k = i + 1, eff = st.done ? m.stages.length + 1 : st.stage, from = st.from || 0;
      var c = Object.assign({}, DEF, sg.words, section._quoteOverride || {});
      var ws = split(el), p = plan(ws, c), t = TREAT[c.treatment] || TREAT.ink;
      el.setAttribute('data-wt', c.treatment);
      var key = k + '|' + from + '|' + eff + '|' + (st.t ? 1 : 0) + '|' + (section._quoteRun || 0);
      var crossed = st.t && from < k && eff >= k, elapsed = crossed ? clock() - st.t : Infinity;
      if (el._key === key) return;                // same reveal already playing or settled (e.g. server echo of our own command)
      cancel(el); el._key = key;
      if (!(elapsed < p.total) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;   // settled: plain text, fully visible
      el._anims = ws.map(function (w, j) {
        var a = w.el.animate(frames(t, w, p.at[j], p.total, c), { duration: p.total, fill: 'none' });
        a.currentTime = Math.max(0, elapsed); return a;
      });
    });
  }

  function render(section, m, st, instant) {
    if (!section || !m) return;
    var n = m.stages.length, stage = st.done ? n + 1 : st.stage, cur = stage >= 1 && stage <= n ? m.stages[stage - 1] : null, map = introOf(section.id, m);
    if (instant) section.classList.add('att-instant');
    section.querySelectorAll('[data-em]').forEach(function (el) {
      var id = el.getAttribute('data-em'), v = 'full';
      if (cur) {
        if ((cur.context || []).indexOf(id) > -1) v = 'context';
        else if ((cur.active || []).indexOf(id) > -1) v = 'active';
        else v = (map[id] || 0) < stage ? 'past' : 'future';
      }
      if (el.getAttribute('data-em-state') !== v) el.setAttribute('data-em-state', v);
    });
    words(section, m, st);
    if (instant) requestAnimationFrame(function () { requestAnimationFrame(function () { section.classList.remove('att-instant'); }); });
  }
  return { render: render, setClock: function (f) { clock = f; }, plan: plan, split: split, TREAT: TREAT };
})();
