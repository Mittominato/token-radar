// Token Radar — dashboard: sortable, filterable board with a detail view.
//
// The page reads window.RADAR, written by main.ts from the same board.json the
// gate checks, so the screenshots and the board can never disagree: the board
// on screen is the board in board.json, row for row. Views are driven by the
// query string so a screenshot is reproducible: ?view=board (default),
// ?view=detail&slug=<slug>, ?view=filtered&category=<name>&scope=<scope>.
// No network is used: every value on screen comes from data.js.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.body.innerHTML = '<p style="padding:24px">Token Radar: no data. The program writes data.js beside this page.</p>';
    return;
  }

  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { sort: 'rank', dir: 1, q: '', cat: '', scope: 'all', minTvl: 0, sel: null };

  var $ = function (id) { return document.getElementById(id); };
  var fmtMoney = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  };
  var fmtPct = function (n) {
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return s;
  };
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // ---- header facts -------------------------------------------------------
  var top = rows[0];
  $('meta').innerHTML =
    '<div>Top implied value<br><b>' + fmtMoney(top.implied) + '</b></div>' +
    '<div>Ranked <b>' + rows.length + '</b> · watchlist <b>' + rows.filter(function (r) { return r.watch; }).length + '</b></div>' +
    '<div>Snapshot <b>' + esc(R.asOf) + '</b> · floor <b>' + fmtMoney(R.floor) + '</b></div>';
  $('asOf').textContent = R.asOf;
  $('modelText').textContent = R.model;

  // ---- category filter ----------------------------------------------------
  var cats = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
  });
  cats.sort();
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    $('cat').appendChild(o);
  });

  // ---- live list (already launched, never ranked) -------------------------
  var liveHtml = '';
  (R.live || []).forEach(function (p) {
    liveHtml += '<li>' + esc(p.name) + ' <span>· ' + esc(p.category || 'uncategorised') +
      ' · TVL ' + fmtMoney(p.tvl) + (p.symbol ? ' · token ' + esc(p.symbol) : '') + '</span></li>';
  });
  $('live').innerHTML = liveHtml;

  // ---- filtering and sorting ----------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.scope === 'watch' && !r.watch) return false;
      if (state.scope === 'growing' && !(r.change > 0)) return false;
      if (r.tvl < state.minTvl) return false;
      return true;
    });
  }

  function sorted(list) {
    var k = state.sort;
    var d = state.dir;
    var val = function (r) {
      if (k === 'chains') return r.chains.length;
      if (k === 'name' || k === 'category') return (r[k] || '').toLowerCase();
      return r[k];
    };
    return list.slice().sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * d;
      if (va > vb) return 1 * d;
      return (a.rank - b.rank) * d;
    });
  }

  function render() {
    var list = sorted(filtered());
    var html = '';
    list.forEach(function (r) {
      var cls = r.change > 0 ? 'up' : r.change < 0 ? 'down' : '';
      html += '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td>' + esc(r.name) + (r.watch ? '<span class="badge">WATCH</span>' : '') + '<br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + fmtMoney(r.tvl) + '</td>' +
        '<td class="num ' + cls + '">' + fmtPct(r.change) + '</td>' +
        '<td class="num">' + r.age.toFixed(1) + 'y</td>' +
        '<td class="num value">' + fmtMoney(r.implied) + '</td></tr>';
    });
    $('rows').innerHTML = html || '<tr><td colspan="8">No protocols match this filter.</td></tr>';
    $('count').textContent = list.length + ' of ' + rows.length + ' shown';
  }

  // ---- detail view ----------------------------------------------------------
  function showDetail(slug) {
    var r = bySlug[slug];
    var box = $('detail');
    if (!r) { box.hidden = true; state.sel = null; render(); return; }
    state.sel = slug;
    var f = r.factors;
    var why = 'Implied value = TVL ' + fmtMoney(r.tvl) + ' x 0.35 x growth ' + f.growth +
      ' x age ' + f.age + ' x breadth ' + f.breadth + ' x category ' + f.category +
      ' = ' + fmtMoney(r.implied) + '.';
    var steps = r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    box.innerHTML =
      '<h2>' + esc(r.name) + (r.watch ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p style="color:var(--muted);margin:0">Rank #' + r.rank + ' · ' + esc(r.slug) +
      ' · ' + esc(r.category || 'uncategorised') + ' · listed ' + esc(r.listed || 'unknown') + '</p>' +
      '<div class="facts">' +
      '<div><span>Implied value</span><b>' + fmtMoney(r.implied) + '</b></div>' +
      '<div><span>TVL</span><b>' + fmtMoney(r.tvl) + '</b></div>' +
      '<div><span>7-day change</span><b>' + fmtPct(r.change) + '</b></div>' +
      '<div><span>Age</span><b>' + r.age.toFixed(1) + ' years</b></div>' +
      '<div><span>Chains</span><b>' + r.chains.length + '</b></div>' +
      '<div><span>Token recorded</span><b>No — pre-token</b></div>' +
      '</div>' +
      '<p class="why">' + esc(why) + '</p>' +
      '<h3>How to farm it</h3><ol class="steps">' + steps + '</ol>';
    box.hidden = false;
    render();
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---- events ---------------------------------------------------------------
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  $('scope').addEventListener('change', function (e) { state.scope = e.target.value; render(); });
  $('minTvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); render(); });
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; }
      render();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  // ---- view from the query string (for reproducible screenshots) ------------
  var params = new URLSearchParams(window.location.search);
  var view = params.get('view') || 'board';
  if (params.get('category')) { state.cat = params.get('category'); $('cat').value = state.cat; }
  if (params.get('scope')) { state.scope = params.get('scope'); $('scope').value = state.scope; }
  if (params.get('q')) { state.q = params.get('q'); $('q').value = state.q; }
  if (params.get('sort')) state.sort = params.get('sort');
  render();
  if (view === 'detail' && params.get('slug')) {
    // A standalone detail view: the board table stays out of the way so the
    // detail panel, its factor breakdown and its farm plan sit at the top.
    document.body.classList.add('solo-detail');
    showDetail(params.get('slug'));
  } else if (view === 'filtered') { state.scope = state.scope === 'all' ? 'growing' : state.scope; render(); }
})();
