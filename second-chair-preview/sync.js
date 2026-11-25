/* Session sync client: one authoritative state on the Mac server; this page applies commands optimistically
   and always adopts the server's state. If the server is unreachable, commands still apply locally and the
   local state is pushed back when the connection returns, so a dropped link never freezes the presentation. */
window.PresenterSync = function (opts) {
  var R = window.PresenterReducer, D = window.DECK;
  var key = new URLSearchParams(location.search).get('k') || (function () { try { return localStorage.getItem('presenter-key'); } catch (e) { return null; } })() || '';
  try { if (key) localStorage.setItem('presenter-key', key); } catch (e) {}
  var q = '?k=' + encodeURIComponent(key);
  var skew = 0, state = null, listeners = [], connected = false, lastBeat = 0, dirtyOffline = false, es = null, extra = {};
  function cache(s) { try { localStorage.setItem('presenter-state', JSON.stringify(s)); } catch (e) {} }
  try { state = JSON.parse(localStorage.getItem('presenter-state')); } catch (e) {}
  if (!state || state.deckId !== D.id || !(state.current in D.columnOf)) { state = R.initial(D, Date.now()); state.deckId = D.id; }
  function now() { return Date.now() + skew; }
  function emit(prev) { cache(state); listeners.forEach(function (f) { f(state, prev); }); }
  function setConn(v) { if (connected !== v) { connected = v; emit(state); } }

  function connect() {
    if (window.SC_STATIC) return;   // hosted preview: no server, everything runs on this device
    if (es) es.close();
    es = new EventSource('api/events' + q);
    es.addEventListener('state', function (e) {
      var msg = JSON.parse(e.data);
      skew = msg.serverNow - Date.now(); lastBeat = Date.now();
      if (dirtyOffline && state.rev > msg.state.rev) { push(); return; }   // our offline work is newer: hand it back
      dirtyOffline = false;
      var prev = state; state = msg.state; setConn(true); emit(prev);
    });
    es.addEventListener('beat', function (e) { var m = JSON.parse(e.data); skew = m.serverNow - Date.now(); lastBeat = Date.now(); setConn(true); });
    Object.keys(extra).forEach(function (ev) { es.addEventListener(ev, function (e) { var d = JSON.parse(e.data); extra[ev].forEach(function (f) { f(d); }); }); });
    es.addEventListener('reload', function () { try { localStorage.removeItem('presenter-state'); } catch (e) {} location.reload(); });
    es.onerror = function () { setConn(false); };
  }
  function push() {
    fetch('api/state' + q, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
      .then(function () { dirtyOffline = false; }).catch(function () {});
  }
  setInterval(function () { if (connected && Date.now() - lastBeat > 6000) setConn(false); if (!connected && es && es.readyState === 2) connect(); }, 1500);

  function send(type, args) {
    var cmd = { type: type, args: args || {} }, prev = state;
    state = R.apply(D, state, cmd, now()); emit(prev);
    if (!connected) { dirtyOffline = true; return; }
    fetch('api/cmd' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) })
      .catch(function () { dirtyOffline = true; setConn(false); });
  }
  connect();
  return {
    send: send, now: now, get state() { return state; }, get connected() { return connected; },
    onChange: function (f) { listeners.push(f); f(state, null); },
    // other server events (live transcription): registered before the first connect or picked up on reconnect
    on: function (ev, f) { if (!extra[ev]) { extra[ev] = []; if (es) { es.addEventListener(ev, function (e) { var d = JSON.parse(e.data); extra[ev].forEach(function (g) { g(d); }); }); } } extra[ev].push(f); },
    post: function (p, b) { return fetch('api/' + p + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }); }
  };
};
