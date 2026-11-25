/* Filler counter for the presenter's own microphone transcript.
   feed(token, tMs) takes each spoken word with its time (speech-to-text word timestamps).
   A filler only counts when it is part of a burst: at least `min` fillers inside `windowMs`.
   Once a burst is reached, every filler in it counts once (the first two included); later fillers
   inside a running burst count as they arrive. Returns how many fillers just became countable. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.FillerCounter = f(); })(this, function () {
  var PURE = /^(um+|uh+|uhm|erm|er|hmm+|mm+|ah+)$/;
  // "like" is a filler only when set off by a pause or comma, doubled, or next to another filler.
  // Verb and comparison uses ("I like", "would like", "looks like", "like this") never count.
  var LIKE_VERB_BEFORE = /^(i|you|we|they|he|she|would|'d|i'd|you'd|we'd|they'd|looks|look|looked|feel|feels|felt|seems|seem|sounds|sound|something|nothing|anything|just|more|much|not|don't|didn't|doesn't|really|also|is|was|were|are|be|kind|sort)$/;
  function clean(t) { return (t || '').toLowerCase().replace(/[’]/g, "'"); }
  function bare(t) { return clean(t).replace(/^[^a-z']+|[^a-z']+$/g, ''); }

  return function FillerCounter(o) {
    o = o || {}; var windowMs = o.windowMs || 5000, min = o.min || 3;
    var prev = null, prevRaw = '', recent = [];   // recent: [{t, counted}]
    function add(t) {
      recent.push({ t: t, counted: false });
      while (recent.length && t - recent[0].t > windowMs) recent.shift();
      if (recent.length < min) return 0;
      var n = 0; recent.forEach(function (r) { if (!r.counted) { r.counted = true; n++; } });
      return n;
    }
    function isFillerLike(raw, w, next) {
      if (w !== 'like') return false;
      var before = prev, afterComma = /,$/.test(prevRaw), ownComma = /,$/.test(clean(raw));
      if (before && LIKE_VERB_BEFORE.test(before) && !afterComma) return false;
      if (ownComma || afterComma) return true;
      if (before === 'like' || (before && PURE.test(before))) return true;
      if (next && (PURE.test(next) || next === 'like')) return true;
      return false;
    }
    return {
      // feed one word; nextRaw (optional) lets "like um" be judged without waiting
      feed: function (raw, t, nextRaw) {
        var w = bare(raw), n = 0, next = nextRaw ? bare(nextRaw) : null;
        if (PURE.test(w)) n = add(t);
        else if (isFillerLike(raw, w, next)) n = add(t);
        prev = w || prev; prevRaw = clean(raw);
        return n;
      },
      pause: function () { prev = null; prevRaw = ''; },   // a long silence counts like a comma
      reset: function () { prev = null; prevRaw = ''; recent = []; }
    };
  };
});
