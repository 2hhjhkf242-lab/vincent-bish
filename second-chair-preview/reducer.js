/* Presenter session reducer: the single source of truth, shared by the Mac server, the audience page and the iPhone controller.
   Pure state transitions plus timestamp-based clocks. Runs in Node and in browsers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PresenterReducer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function initial(deck, now) {
    return {
      v: 1, rev: 0, current: deck.mains[0], origin: null, slides: {},
      clock: { running: false, started: false, durationMs: deck.defaults.durationMin * 60000, reservePct: deck.defaults.reservePct, lastTs: now },
      acc: { total: 0, sections: {}, slides: {}, detours: {} },
      log: []
    };
  }
  var isMain = function (deck, id) { return deck.mainIndex[id] !== undefined; };
  var stagesOf = function (deck, id) { var m = deck.att[id]; return m ? m.stages.length : 0; };
  var slideState = function (s, id) { return s.slides[id] || { stage: 0, done: false }; };
  var narrativeHome = function (s) { return s.origin || s.current; };

  /* attribute elapsed time since lastTs to the buckets that were live */
  function settle(deck, s, now) {
    var c = s.clock, dt = Math.max(0, now - c.lastTs);
    if (c.running && c.started && dt) {
      var home = narrativeHome(s), sec = deck.sectionOf[home];
      s.acc.total += dt;
      if (sec) s.acc.sections[sec] = (s.acc.sections[sec] || 0) + dt;                 // all time in the section, for the record
      if (s.origin) s.acc.detours[s.current] = (s.acc.detours[s.current] || 0) + dt;   // rebuttal detour; origin slide clock held
      else if (s.hold) s.acc.held = (s.acc.held || 0) + dt;                             // answering a question, objection or follow-up
      else s.acc.slides[s.current] = (s.acc.slides[s.current] || 0) + dt;
      if (sec && !s.origin && !s.hold) { s.acc.own = s.acc.own || {}; s.acc.own[sec] = (s.acc.own[sec] || 0) + dt; }   // the presenter's own time, for "wrap it up"
    }
    c.lastTs = now;
  }

  function column(deck, id) { return deck.columns[deck.columnOf[id]]; }
  function step(deck, s, dir) {           // up (-1) / down (+1) inside the current column, skipping blank spacers
    var col = column(deck, s.current); if (!col) return;
    var i = col.rows.indexOf(s.current) + dir;
    while (i >= 0 && i < col.rows.length && !col.rows[i]) i += dir;
    if (i < 0 || i >= col.rows.length) return;
    var id = col.rows[i];
    if (id === col.main) { s.current = id; s.origin = null; }
    else { if (!s.origin) s.origin = s.current; s.current = id; }
  }
  function moveMain(deck, s, dir) {
    var i = deck.mainIndex[s.current] + dir;
    if (i >= 0 && i < deck.mains.length) s.current = deck.mains[i];
  }

  function apply(deck, s0, cmd, now) {
    var s = JSON.parse(JSON.stringify(s0));
    settle(deck, s, now);
    var a = cmd.args || {}, cur = s.current, st;
    if (['next', 'prev', 'up', 'down', 'goto', 'return'].indexOf(cmd.type) > -1) delete s.hold;   // moving on ends a question hold
    switch (cmd.type) {
      case 'next':
        if (s.origin) { s.current = s.origin; s.origin = null; break; }
        st = slideState(s, cur);
        if (st.done && st.t && st.revealMs && now - st.t < st.revealMs) { st.t = 0; s.slides[cur] = st; break; }   // a click mid-reveal completes it
        if (stagesOf(deck, cur) && !st.done) {
          var n = stagesOf(deck, cur); st.from = st.stage; st.t = now;
          st.stage += 1;
          var sg = deck.att[cur].stages[st.stage - 1] || {};
          if (st.stage > n || sg.terminal) { st.stage = n + 1; st.done = true; st.revealMs = sg.words ? sg.words.total : 0; }
          s.slides[cur] = st;
        } else moveMain(deck, s, 1);
        break;
      case 'prev':
        if (s.origin) { s.current = s.origin; s.origin = null; break; }
        st = slideState(s, cur);
        if (stagesOf(deck, cur) && !st.done && st.stage > 0) { st.from = st.stage; st.t = now; st.stage -= 1; s.slides[cur] = st; }
        else moveMain(deck, s, -1);
        break;
      case 'up': step(deck, s, -1); break;
      case 'down': step(deck, s, 1); break;
      case 'goto':
        if (!deck.columnOf.hasOwnProperty(a.id)) break;
        if (isMain(deck, a.id)) { s.current = a.id; s.origin = null; }
        else { if (!s.origin) s.origin = isMain(deck, cur) ? cur : deck.columns[deck.columnOf[a.id]].main; s.current = a.id; }
        break;
      case 'return': if (s.origin) { s.current = s.origin; s.origin = null; } break;
      case 'tag':   // presenter marks the conversational turn: question, objection, follow-up, small talk
        if (['question', 'objection', 'followup', 'smalltalk'].indexOf(a.kind) > -1) {
          s.turn = { kind: a.kind, at: now, slide: narrativeHome(s), stage: slideState(s, narrativeHome(s)).stage };
          s.log = (s.log || []).concat([s.turn]).slice(-400);
          if (a.kind === 'smalltalk') delete s.hold;
          else if (s.hold && s.hold.kind === a.kind) delete s.hold;      // tapping the lit button again releases the hold
          else s.hold = { kind: a.kind, at: now };
        }
        break;
      case 'setVar':   // live exhibit controls (e.g. the review-model slider), mirrored on every screen
        if (/^[a-zA-Z0-9]{1,20}$/.test(a.k || '') && (a.v === null || (typeof a.v === 'number' && a.v >= 0 && a.v <= 1))) {
          s.vars = s.vars || {}; if (a.v === null) delete s.vars[a.k]; else s.vars[a.k] = Math.round(a.v * 1000) / 1000;
        }
        break;
      case 'filler':   // the listener reports fillers that fell inside a burst (3 or more within 5 seconds)
        if (a.n > 0 && a.n < 50) {
          var fh = narrativeHome(s); s.fillers = s.fillers || { total: 0, slides: {} };
          s.fillers.total += a.n; s.fillers.slides[fh] = (s.fillers.slides[fh] || 0) + a.n;
          s.log = (s.log || []).concat([{ kind: 'filler', n: a.n, at: now, slide: fh }]).slice(-400);
        }
        break;
      case 'replay': var h = narrativeHome(s); delete s.slides[h]; break;
      case 'reset': if (a.confirm === 'RESET') { var keep = s.clock.durationMs, r = s.clock.reservePct; s = initial(deck, now); s.clock.durationMs = keep; s.clock.reservePct = r; } break;
      case 'start': s.clock.started = true; s.clock.running = true; break;
      case 'pause': s.clock.running = false; break;
      case 'resume': if (s.clock.started) s.clock.running = true; break;
      case 'setDuration': if (!s.clock.started && a.min > 0 && a.min <= 180) s.clock.durationMs = Math.round(a.min * 60000); break;
      case 'setReserve': if (a.pct >= 0 && a.pct <= 40) s.clock.reservePct = a.pct; break;
      default: return s0;
    }
    s.rev = s0.rev + 1; if (s0.deckId) s.deckId = s0.deckId;
    return s;
  }

  /* live values for display, using the client's estimate of server time */
  function live(deck, s, now) {
    var c = s.clock, extra = c.running && c.started ? Math.max(0, now - c.lastTs) : 0;
    var home = narrativeHome(s), sec = deck.sectionOf[home];
    var total = s.acc.total + extra;
    return {
      total: total, remaining: c.durationMs - total,
      section: (s.acc.sections[sec] || 0) + extra, sectionId: sec,
      slide: (s.acc.slides[home] || 0) + (s.origin || s.hold ? 0 : extra),
      detour: s.origin ? (s.acc.detours[s.current] || 0) + extra : 0,
      own: ((s.acc.own || {})[sec] || 0) + (s.origin || s.hold ? 0 : extra),
      held: !!(s.origin || s.hold), hold: s.hold ? s.hold.kind : (s.origin ? 'rebuttal' : null)
    };
  }

  /* weighted budgets scaled to the speaking time left after the reserve */
  function budgets(deck, s) {
    var speak = s.clock.durationMs * (1 - s.clock.reservePct / 100), w = deck.weights, tot = 0, out = { slides: {}, sections: {} };
    deck.mains.forEach(function (id) { tot += w[id]; });
    deck.mains.forEach(function (id) {
      var ms = speak * w[id] / tot, sec = deck.sectionOf[id];
      out.slides[id] = ms; out.sections[sec] = (out.sections[sec] || 0) + ms;
    });
    return out;
  }

  return { initial: initial, apply: apply, live: live, budgets: budgets, stagesOf: stagesOf, slideState: slideState };
});
