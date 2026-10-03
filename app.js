'use strict';

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(r)  { console.log('SW OK:', r.scope); })
      .catch(function(e) { console.warn('SW error:', e); });
  });
}

// ── Estado global ──
var REFRESH_MS    = 120000;
var currentFilter = 'all';
var refreshTimer  = null;
var allSignals    = [];
var currentTab    = 'trending';

// ── IDs de red ──
var NETWORK_MAP = {
  1399811149: 'SOL',
  8453:       'BASE',
  56:         'BNB',
  1:          'ETH',
  10:         'ETH',
  137:        'MATIC',
};

var CHAIN_EMOJI = {
  SOL:'◎', ETH:'Ξ', BASE:'🔵', BNB:'🟡', MONAD:'🟣', RH:'🔴', MATIC:'🟣',
};

// ─────────────────────────────────────────────────────
//  🚦 MOTOR DE SEÑALES LED
//  Evalúa 5 factores y devuelve: 'buy' | 'wait' | 'sell'
// ─────────────────────────────────────────────────────
function calcSignal(token) {
  var puntos   = 0;
  var razones  = { buy: [], warn: [], sell: [] };

  var change   = token.change24h    || 0;
  var mcapRaw  = token.mcapRaw      || 0;
  var volRaw   = token.volRaw       || 0;
  var holders  = token.holders      || 0;
  var rank     = token.rank         || 99;
  var ratio    = mcapRaw > 0 ? (volRaw / mcapRaw) : 0; // Vol/MCap

  // ── FACTOR 1: Cambio de precio 24h ──
  if (change >= 20 && change <= 2000) {
    puntos++;
    razones.buy.push('📈 Momentum sano (+' + change.toFixed(0) + '%)');
  } else if (change > 2000 && change <= 5000) {
    razones.warn.push('⚡ Cambio muy alto (' + change.toFixed(0) + '%) — posible techo');
  } else if (change > 5000) {
    puntos--;
    razones.sell.push('🔥 +' + change.toFixed(0) + '% — probable caída inminente');
  } else if (change > 0 && change < 20) {
    razones.warn.push('😴 Movimiento lento (+' + change.toFixed(0) + '%)');
  } else {
    puntos--;
    razones.sell.push('📉 Precio bajando (' + change.toFixed(0) + '%)');
  }

  // ── FACTOR 2: Ratio Volumen / Market Cap ──
  if (ratio >= 0.5) {
    puntos++;
    razones.buy.push('💧 Volumen alto vs MCap (' + (ratio * 100).toFixed(0) + '%)');
  } else if (ratio >= 0.2) {
    razones.warn.push('💧 Volumen moderado (' + (ratio * 100).toFixed(0) + '%)');
  } else {
    puntos--;
    razones.sell.push('💧 Volumen bajo — poco interés real');
  }

  // ── FACTOR 3: Holders ──
  if (holders >= 3000) {
    puntos++;
    razones.buy.push('👥 Comunidad sólida (' + holders.toLocaleString() + ' holders)');
  } else if (holders >= 1000) {
    razones.warn.push('👥 Comunidad en formación (' + holders.toLocaleString() + ')');
  } else {
    puntos--;
    razones.sell.push('⚠️ Pocos holders (' + holders.toLocaleString() + ') — riesgo alto');
  }

  // ── FACTOR 4: Market Cap (espacio para crecer) ──
  if (mcapRaw > 0 && mcapRaw < 5000000) {
    puntos++;
    razones.buy.push('🚀 MCap pequeño ($' + (mcapRaw/1000000).toFixed(2) + 'M) — mucho espacio');
  } else if (mcapRaw >= 5000000 && mcapRaw < 20000000) {
    razones.warn.push('📊 MCap mediano ($' + (mcapRaw/1000000).toFixed(1) + 'M)');
  } else if (mcapRaw >= 20000000) {
    puntos--;
    razones.sell.push('🏔️ MCap alto ($' + (mcapRaw/1000000).toFixed(0) + 'M) — difícil multiplicar');
  }

  // ── FACTOR 5: Rank en fomo.family ──
  if (rank <= 5) {
    puntos++;
    razones.buy.push('⭐ Top #' + rank + ' en fomo.family ahora mismo');
  } else if (rank <= 15) {
    razones.warn.push('📡 Rank #' + rank + ' — en el radar');
  } else {
    puntos--;
    razones.sell.push('👻 Rank #' + rank + ' — poca visibilidad');
  }

  // ── DECISIÓN FINAL ──
  var signal, label, explanation;

  if (puntos >= 3) {
    signal      = 'buy';
    label       = '🟢 COMPRAR';
    explanation = razones.buy.length > 0
      ? razones.buy.join(' • ')
      : 'Múltiples factores positivos alineados';
  } else if (puntos >= 1) {
    signal      = 'wait';
    label       = '🟡 ESPERAR';
    explanation = razones.warn.length > 0
      ? razones.warn.join(' • ')
      : 'Señales mixtas — no es momento claro';
  } else {
    signal      = 'sell';
    label       = '🔴 NO ENTRAR';
    explanation = razones.sell.length > 0
      ? razones.sell.join(' • ')
      : 'Condiciones desfavorables';
  }

  return { signal: signal, label: label, explanation: explanation, puntos: puntos };
}

// ─────────────────────────────────────────────────────
//  DATOS DEMO — plan B si la API falla
// ─────────────────────────────────────────────────────
function generateDemoSignals() {
  var DEMO = [
    { token:'BONK',   address:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', chain:'SOL',  emoji:'🐕', change24h:185,   mcapRaw:450000000, volRaw:38000000,  holders:85000, rank:3  },
    { token:'WIF',    address:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', chain:'SOL',  emoji:'🐶', change24h:42,    mcapRaw:1200000,   volRaw:890000,    holders:2800,  rank:7  },
    { token:'POPCAT', address:'7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', chain:'SOL',  emoji:'🐱', change24h:7200,  mcapRaw:8000000,   volRaw:1200000,   holders:4200,  rank:2  },
    { token:'BRETT',  address:'0x532f27101965dd16442e59d40670faf5ebb142e4',     chain:'BASE', emoji:'🐸', change24h:95,    mcapRaw:3200000,   volRaw:4100000,   holders:6500,  rank:1  },
    { token:'DEGEN',  address:'0x4ed4e862860bed51a9570b96d89af5e1b0efefed',     chain:'BASE', emoji:'🎰', change24h:-8,    mcapRaw:25000000,  volRaw:1100000,   holders:12000, rank:11 },
    { token:'PEPE',   address:'0x6982508145454ce325ddbe47a25d4ec3d2311933',     chain:'ETH',  emoji:'🐸', change24h:320,   mcapRaw:4200000,   volRaw:3900000,   holders:9800,  rank:4  },
    { token:'SHIB',   address:'0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',     chain:'ETH',  emoji:'🐕', change24h:12,    mcapRaw:11000000,  volRaw:900000,    holders:1200,  rank:18 },
    { token:'FLOKI',  address:'0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',     chain:'BNB',  emoji:'⚡', change24h:8100,  mcapRaw:560000,    volRaw:2200000,   holders:420,   rank:6  },
  ];

  return DEMO.map(function(t, i) {
    var score    = Math.floor(Math.random() * 35) + 60;
    var strength = score >= 82 ? 'strong' : score >= 68 ? 'medium' : 'weak';
    var sigData  = calcSignal(t);
    return {
      id:          'demo-' + t.token + '-' + i,
      rank:        t.rank,
      token:       t.token,
      name:        t.token,
      address:     t.address,
      chain:       t.chain,
      emoji:       t.emoji,
      strength:    strength,
      score:       score,
      change24h:   t.change24h,
      price:       '$' + (Math.random() * 0.01).toFixed(6),
      mcap:        parseFloat((t.mcapRaw  / 1000000).toFixed(2)),
      volume:      parseFloat((t.volRaw   / 1000000).toFixed(2)),
      mcapRaw:     t.mcapRaw,
      volRaw:      t.volRaw,
      holders:     t.holders,
      momentum:    Math.floor(Math.random() * 30 + 60),
      timestamp:   new Date(),
      image:       '',
      isDemo:      true,
      signal:      sigData.signal,
      signalLabel: sigData.label,
      signalText:  sigData.explanation,
      puntos:      sigData.puntos,
    };
  }).sort(function(a, b) { return a.rank - b.rank; });
}

// ─────────────────────────────────────────────────────
//  FETCH — Datos reales de fomo.family
// ─────────────────────────────────────────────────────
function fetchFomoTokens(board) {
  var dot = document.getElementById('statusDot');
  var txt = document.getElementById('statusText');
  dot.className   = 'status-dot';
  txt.textContent = 'Conectando a fomo.family...';

  return fetch('/api/fomo?type=' + board + '&limit=30')
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(err) {
          if (err.hint) showToast('⚙️ ' + err.hint, 6000);
          throw new Error('Proxy error ' + res.status);
        });
      }
      return res.json();
    })
    .then(function(data) {
      var tokens = data.tokens;
      if (!Array.isArray(tokens) || tokens.length === 0) {
        throw new Error('Sin tokens en la respuesta');
      }

      var emojiMap = {
        BONK:'🐕', WIF:'🐶', POPCAT:'🐱', BRETT:'🐸', DEGEN:'🎰',
        PEPE:'🐸', SHIB:'🐕', FLOKI:'⚡', TURBO:'🚀', BOME:'💣',
        MON:'🟣', BABYDOGE:'🐶', CAKE:'🎂', TOSHI:'🐱', NORMIE:'😐',
        ASTROINU:'🐕', AGENCY:'🤖', SPEC:'⚡',
      };

      return tokens.map(function(t, i) {
        var symbol   = t.token && t.token.symbol  ? t.token.symbol.toUpperCase() : '???';
        var name     = t.token && t.token.name    ? t.token.name                 : symbol;
        var address  = t.token && t.token.address ? t.token.address              : '';
        var networkId= t.network  || 0;
        var chain    = NETWORK_MAP[networkId] || 'SOL';
        var holders  = t.holders      || 0;
        var change24 = t.change24h    || 0;
        var mcapRaw  = t.marketCapUsd || 0;
        var volRaw   = t.volume24hUsd || 0;
        var price    = t.priceUsd     || 0;
        var rank     = t.rank         || (i + 1);

        // Limitar cambio para visualización
        var changeDisplay = Math.min(change24, 9999);

        // Score base
        var rankScore   = Math.max(0, 30 - rank);
        var changeScore = Math.min(30, Math.max(0, changeDisplay / 100));
        var holderScore = Math.min(20, holders / 200);
        var mcapScore   = mcapRaw < 5000000  ? 15 : mcapRaw < 20000000 ? 10 : 5;
        var score       = Math.round(Math.min(100, 10 + rankScore + changeScore + holderScore + mcapScore));
        var strength    = score >= 80 ? 'strong' : score >= 62 ? 'medium' : 'weak';

        // Formatear precio
        var priceStr;
        if      (price === 0)         priceStr = '$0';
        else if (price < 0.0001)      priceStr = '$' + price.toExponential(2);
        else if (price < 1)           priceStr = '$' + price.toFixed(6);
        else                          priceStr = '$' + price.toFixed(4);

        // ── Calcular señal LED con datos completos ──
        var tokenData = {
          change24h: change24,
          mcapRaw:   mcapRaw,
          volRaw:    volRaw,
          holders:   holders,
          rank:      rank,
        };
        var sigData = calcSignal(tokenData);

        return {
          id:          'fomo-' + (address || i) + '-' + Date.now(),
          rank:        rank,
          token:       symbol,
          name:        name,
          address:     address,
          chain:       chain,
          emoji:       emojiMap[symbol] || (CHAIN_EMOJI[chain] || '💎'),
          strength:    strength,
          score:       score,
          change24h:   parseFloat(changeDisplay.toFixed(2)),
          price:       priceStr,
          mcap:        parseFloat((mcapRaw / 1000000).toFixed(2)),
          volume:      parseFloat((volRaw  / 1000000).toFixed(2)),
          mcapRaw:     mcapRaw,
          volRaw:      volRaw,
          holders:     holders,
          momentum:    Math.min(98, Math.max(25, score + (Math.random() * 6 - 3))),
          timestamp:   new Date(data.capturedAt || Date.now()),
          image:       t.image || '',
          isDemo:      false,
          signal:      sigData.signal,
          signalLabel: sigData.label,
          signalText:  sigData.explanation,
          puntos:      sigData.puntos,
        };
      }).sort(function(a, b) { return a.rank - b.rank; });
    })
    .catch(function(err) {
      console.warn('fomoapi.io no disponible:', err.message);
      document.getElementById('statusDot').className    = 'status-dot offline';
      document.getElementById('statusText').textContent = '⚠️ Demo';
      showToast('⚠️ Mostrando datos demo', 4000);
      return generateDemoSignals();
    });
}

// ─────────────────────────────────────────────────────
//  COPIAR DIRECCIÓN
// ─────────────────────────────────────────────────────
function copyAddress(address, token) {
  if (!address) {
    showToast('⚠️ Este token no tiene dirección disponible', 3000);
    return;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(address)
      .then(function() {
        showToast('✅ ' + token + ' copiado: ' + address.slice(0,6) + '...' + address.slice(-4));
      })
      .catch(function() { fallbackCopy(address, token); });
  } else {
    fallbackCopy(address, token);
  }
}

function fallbackCopy(address, token) {
  var el            = document.createElement('textarea');
  el.value          = address;
  el.style.position = 'fixed';
  el.style.opacity  = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  showToast('✅ ' + token + ' copiado al portapapeles');
}

// ─────────────────────────────────────────────────────
//  RENDER — Tarjeta individual con LED
// ─────────────────────────────────────────────────────
function renderSignalCard(s) {
  var badgeClass  = s.strength === 'strong' ? 'badge-strong'
                  : s.strength === 'medium' ? 'badge-medium' : 'badge-weak';
  var barClass    = s.score >= 82 ? 'fill-green'
                  : s.score >= 65 ? 'fill-yellow' : 'fill-red';
  var pnlUp       = s.change24h >= 0;
  var chainIcon   = CHAIN_EMOJI[s.chain] || '🔗';

  // Clases del LED
  var ledClass    = 'led-' + s.signal;
  var ledPulse    = s.signal === 'buy' ? 'led-pulse' : '';

  var sec     = Math.floor((Date.now() - new Date(s.timestamp)) / 1000);
  var timeAgo = sec < 60
    ? sec + 's'
    : sec < 3600 ? Math.floor(sec / 60) + 'm'
    : Math.floor(sec / 3600) + 'h';

  var shortAddr = s.address
    ? s.address.slice(0,6) + '...' + s.address.slice(-4)
    : 'Sin dirección';

  var sourceTag = s.isDemo
    ? '<span class="source-tag demo">⚠️ DEMO</span>'
    : '<span class="source-tag real">✅ fomo.family</span>';

  var safeAddr  = s.address.replace(/'/g,'').replace(/"/g,'');
  var safeToken = s.token.replace(/'/g,'').replace(/"/g,'');

  var tokenIcon = s.image
    ? '<img src="' + s.image + '" width="36" height="36" style="border-radius:50%;object-fit:cover;" onerror="this.style.display=\'none\'" />'
    : '<div class="token-icon">' + s.emoji + '</div>';

  // Puntos del LED (descripción para el usuario)
  var puntosStr = s.puntos >= 3 ? s.puntos + '/5 factores ✅'
                : s.puntos >= 1 ? s.puntos + '/5 factores ⚠️'
                : s.puntos + '/5 factores ❌';

  return '' +
  '<article class="signal-card ' + s.strength + '" data-chain="' + s.chain + '" data-id="' + s.id + '">' +

    // ── BARRA LED (ocupa todo el ancho arriba) ──
    '<div class="led-bar ' + ledClass + '">' +
      '<div class="led-dot ' + ledClass + ' ' + ledPulse + '"></div>' +
      '<div class="led-info">' +
        '<span class="led-label">' + s.signalLabel + '</span>' +
        '<span class="led-reason">' + s.signalText + '</span>' +
      '</div>' +
      '<span class="led-score">' + puntosStr + '</span>' +
    '</div>' +

    // ── CABECERA ──
    '<div class="signal-header">' +
      '<div class="signal-token">' +
        tokenIcon +
        '<div>' +
          '<div class="token-name">' +
            '<span class="rank-badge">#' + s.rank + '</span> ' +
            s.token + ' ' +
            '<span class="chain-mini">' + chainIcon + ' ' + s.chain + '</span>' +
          '</div>' +
          '<button class="address-btn" onclick="copyAddress(\'' + safeAddr + '\',\'' + safeToken + '\')" title="Copiar dirección">' +
            '<span class="address-text">' + shortAddr + '</span>' +
            '<span class="copy-icon">📋</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<span class="signal-badge ' + badgeClass + '">' +
        (s.strength === 'strong' ? '🔥 Fuerte' : s.strength === 'medium' ? '📈 Media' : '📊 Débil') +
      '</span>' +
    '</div>' +

    // ── STATS ──
    '<div class="signal-stats">' +
      '<div class="signal-stat">' +
        '<span class="signal-stat-label">Cambio 24h</span>' +
        '<span class="signal-stat-value ' + (pnlUp ? 'up' : 'down') + '">' +
          (pnlUp ? '+' : '') + s.change24h + '%' +
        '</span>' +
      '</div>' +
      '<div class="signal-stat">' +
        '<span class="signal-stat-label">Precio</span>' +
        '<span class="signal-stat-value">' + s.price + '</span>' +
      '</div>' +
      '<div class="signal-stat">' +
        '<span class="signal-stat-label">MCap</span>' +
        '<span class="signal-stat-value">$' + s.mcap + 'M</span>' +
      '</div>' +
      '<div class="signal-stat">' +
        '<span class="signal-stat-label">Vol 24h</span>' +
        '<span class="signal-stat-value">$' + s.volume + 'M</span>' +
      '</div>' +
      '<div class="signal-stat">' +
        '<span class="signal-stat-label">Holders</span>' +
        '<span class="signal-stat-value">' + s.holders.toLocaleString() + '</span>' +
      '</div>' +
      '<div class="signal-stat">' +
        '<span class="signal-stat-label">Score</span>' +
        '<span class="signal-stat-value ' + (s.score>=80?'up':s.score>=62?'':'down') + '">' +
          s.score + '/100' +
        '</span>' +
      '</div>' +
    '</div>' +

    // ── BARRA MOMENTUM ──
    '<div class="signal-bar-wrap">' +
      '<div class="signal-bar-label">' +
        '<span>Momentum fomo.family</span>' +
        '<span>' + Math.round(s.momentum) + '%</span>' +
      '</div>' +
      '<div class="signal-bar">' +
        '<div class="signal-bar-fill ' + barClass + '" style="width:' + Math.round(s.momentum) + '%"></div>' +
      '</div>' +
    '</div>' +

    // ── DIRECCIÓN COMPLETA ──
    (s.address ?
      '<div class="full-address-wrap">' +
        '<span class="full-address-label">Contrato:</span>' +
        '<span class="full-address">' + s.address + '</span>' +
        '<button class="btn-copy-full" onclick="copyAddress(\'' + safeAddr + '\',\'' + safeToken + '\')">📋 Copiar</button>' +
      '</div>'
    : '') +

    // ── FOOTER ──
    '<div class="signal-footer">' +
      '<span>🕐 hace ' + timeAgo + '</span>' +
      sourceTag +
      '<span>👥 ' + s.holders.toLocaleString() + ' holders</span>' +
    '</div>' +

  '</article>';
}

// ─────────────────────────────────────────────────────
//  RENDER GRID
// ─────────────────────────────────────────────────────
function renderSignals() {
  var grid = document.getElementById('signalsGrid');
  var list = allSignals;

  if      (currentFilter === 'strong') list = allSignals.filter(function(s){ return s.strength === 'strong'; });
  else if (currentFilter === 'buy')    list = allSignals.filter(function(s){ return s.signal   === 'buy';    });
  else if (currentFilter !== 'all')    list = allSignals.filter(function(s){ return s.chain    === currentFilter; });

  if (list.length === 0) {
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="icon">🔍</div>' +
        '<p>Sin señales para este filtro.</p>' +
        '<p style="font-size:12px">Prueba "Todas" o espera la próxima actualización.</p>' +
      '</div>';
    return;
  }
  grid.innerHTML = list.map(renderSignalCard).join('');
}

// ─────────────────────────────────────────────────────
//  STATS BAR
// ─────────────────────────────────────────────────────
function updateStats() {
  var buys    = allSignals.filter(function(s){ return s.signal === 'buy';  });
  var waits   = allSignals.filter(function(s){ return s.signal === 'wait'; });
  var sells   = allSignals.filter(function(s){ return s.signal === 'sell'; });
  var best    = allSignals[0];
  var now     = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });

  document.getElementById('totalSignals').textContent = allSignals.length;
  document.getElementById('winRate').textContent      = '🟢' + buys.length + ' 🟡' + waits.length + ' 🔴' + sells.length;
  document.getElementById('bestSignal').textContent   = best ? best.token + ' #' + best.rank : '—';
  document.getElementById('lastUpdate').textContent   = now;
}

// ─────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────
function showToast(msg, duration) {
  duration = duration || 2800;
  var t    = document.getElementById('toast');
  if (!t)  return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, duration);
}

// ─────────────────────────────────────────────────────
//  CARGAR DATOS
// ─────────────────────────────────────────────────────
function loadData(showSpinner) {
  var loading = document.getElementById('loadingState');
  var grid    = document.getElementById('signalsGrid');

  if (showSpinner) {
    loading.style.display = 'flex';
    grid.style.display    = 'none';
  }

  fetchFomoTokens(currentTab)
    .then(function(signals) {
      allSignals            = signals;
      loading.style.display = 'none';
      grid.style.display    = 'grid';
      updateStats();
      renderSignals();

      if (!signals[0] || !signals[0].isDemo) {
        var buys = signals.filter(function(s){ return s.signal === 'buy'; }).length;
        document.getElementById('statusDot').className    = 'status-dot online';
        document.getElementById('statusText').textContent = '✅ fomo.family en vivo';
        showToast('✅ ' + signals.length + ' tokens — ' + buys + ' señales de compra');
      }
    })
    .catch(function(err) {
      console.error('Error critico:', err);
      loading.style.display = 'none';
      grid.style.display    = 'grid';
      allSignals = generateDemoSignals();
      updateStats();
      renderSignals();
      document.getElementById('statusDot').className    = 'status-dot offline';
      document.getElementById('statusText').textContent = '❌ Error';
    });
}

// ─────────────────────────────────────────────────────
//  INICIALIZAR
// ─────────────────────────────────────────────────────
function init() {
  loadData(true);
  refreshTimer = setInterval(function(){ loadData(false); }, REFRESH_MS);

  var btn = document.getElementById('btnRefresh');
  if (btn) {
    btn.addEventListener('click', function() {
      btn.classList.add('spinning');
      setTimeout(function(){ btn.classList.remove('spinning'); }, 600);
      clearInterval(refreshTimer);
      loadData(false);
      refreshTimer = setInterval(function(){ loadData(false); }, REFRESH_MS);
    });
  }

  document.querySelectorAll('[data-tab]').forEach(function(b) {
    b.addEventListener('click', function() {
      document.querySelectorAll('[data-tab]').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      currentTab = b.dataset.tab;
      loadData(true);
    });
  });

  document.querySelectorAll('.filter-btn').forEach(function(b) {
    b.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      currentFilter = b.dataset.filter;
      renderSignals();
    });
  });
}

window.copyAddress = copyAddress;
document.addEventListener('DOMContentLoaded', init);
