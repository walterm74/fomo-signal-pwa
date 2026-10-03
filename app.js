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

// ── IDs de red confirmados desde la API real ──
// 1399811149 = Solana, 8453 = Base, 56 = BNB, 1 = Ethereum
var NETWORK_MAP = {
  1399811149: 'SOL',
  8453:       'BASE',
  56:         'BNB',
  1:          'ETH',
  10:         'ETH',   // Optimism
  137:        'ETH',   // Polygon
};

var CHAIN_EMOJI = {
  SOL:   '◎',
  ETH:   'Ξ',
  BASE:  '🔵',
  BNB:   '🟡',
  MONAD: '🟣',
  RH:    '🔴',
};

// ─────────────────────────────────────────────────────
//  DATOS DEMO — plan B si la API falla
// ─────────────────────────────────────────────────────
function generateDemoSignals() {
  var DEMO = [
    { token:'BONK',   address:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', chain:'SOL',  emoji:'🐕' },
    { token:'WIF',    address:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', chain:'SOL',  emoji:'🐶' },
    { token:'POPCAT', address:'7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', chain:'SOL',  emoji:'🐱' },
    { token:'BRETT',  address:'0x532f27101965dd16442e59d40670faf5ebb142e4',     chain:'BASE', emoji:'🐸' },
    { token:'DEGEN',  address:'0x4ed4e862860bed51a9570b96d89af5e1b0efefed',     chain:'BASE', emoji:'🎰' },
    { token:'PEPE',   address:'0x6982508145454ce325ddbe47a25d4ec3d2311933',     chain:'ETH',  emoji:'🐸' },
    { token:'SHIB',   address:'0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',     chain:'ETH',  emoji:'🐕' },
    { token:'FLOKI',  address:'0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',     chain:'BNB',  emoji:'⚡' },
  ];

  return DEMO.map(function(t, i) {
    var score    = Math.floor(Math.random() * 35) + 60;
    var strength = score >= 82 ? 'strong' : score >= 68 ? 'medium' : 'weak';
    return {
      id:        'demo-' + t.token + '-' + i,
      rank:      i + 1,
      token:     t.token,
      name:      t.token,
      address:   t.address,
      chain:     t.chain,
      emoji:     t.emoji,
      strength:  strength,
      score:     score,
      change24h: parseFloat((Math.random() * 200 - 10).toFixed(1)),
      price:     (Math.random() * 0.01).toFixed(6),
      mcap:      parseFloat((Math.random() * 50 + 1).toFixed(1)),
      volume:    parseFloat((Math.random() * 5 + 0.1).toFixed(2)),
      holders:   Math.floor(Math.random() * 5000 + 500),
      momentum:  Math.floor(Math.random() * 30 + 60),
      timestamp: new Date(),
      isDemo:    true,
    };
  }).sort(function(a, b) { return b.score - a.score; });
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

        // ── Leer campos con la estructura REAL confirmada ──
        var symbol  = t.token && t.token.symbol  ? t.token.symbol.toUpperCase()  : '???';
        var name    = t.token && t.token.name    ? t.token.name                  : symbol;
        var address = t.token && t.token.address ? t.token.address               : '';

        // network llega como NÚMERO → convertir a nombre
        var networkId = t.network || 0;
        var chain     = NETWORK_MAP[networkId] || 'SOL';

        var holders  = t.holders         || 0;
        var change24 = t.change24h       || 0;
        var mcapRaw  = t.marketCapUsd    || 0;
        var volRaw   = t.volume24hUsd    || 0;   // ← nombre real confirmado
        var price    = t.priceUsd        || 0;
        var rank     = t.rank            || (i + 1);

        // Limitar change24h a un máximo visual de 9999%
        var changeDisplay = Math.min(change24, 9999);

        // Score basado en datos reales
        var rankScore    = Math.max(0, 30 - rank);
        var changeScore  = Math.min(30, Math.max(0, changeDisplay / 100));
        var holderScore  = Math.min(20, holders / 200);
        var mcapScore    = mcapRaw < 50000000 ? 15 : 8;
        var score        = Math.round(Math.min(100, 10 + rankScore + changeScore + holderScore + mcapScore));
        var strength     = score >= 80 ? 'strong' : score >= 62 ? 'medium' : 'weak';

        // Formatear precio legible
        var priceStr;
        if (price === 0)         priceStr = '$0';
        else if (price < 0.0001) priceStr = '$' + price.toExponential(2);
        else if (price < 1)      priceStr = '$' + price.toFixed(6);
        else                     priceStr = '$' + price.toFixed(4);

        return {
          id:        'fomo-' + (address || i) + '-' + Date.now(),
          rank:      rank,
          token:     symbol,
          name:      name,
          address:   address,
          chain:     chain,
          emoji:     emojiMap[symbol] || (CHAIN_EMOJI[chain] || '💎'),
          strength:  strength,
          score:     score,
          change24h: parseFloat(changeDisplay.toFixed(2)),
          price:     priceStr,
          mcap:      parseFloat((mcapRaw  / 1000000).toFixed(2)),
          volume:    parseFloat((volRaw   / 1000000).toFixed(2)),
          holders:   holders,
          momentum:  Math.min(98, Math.max(25, score + (Math.random() * 6 - 3))),
          timestamp: new Date(data.capturedAt || Date.now()),
          image:     t.image || '',
          isDemo:    false,
        };
      }).sort(function(a, b) { return a.rank - b.rank; });
    })
    .catch(function(err) {
      console.warn('fomoapi.io no disponible:', err.message);
      document.getElementById('statusDot').className   = 'status-dot offline';
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
  var el       = document.createElement('textarea');
  el.value     = address;
  el.style.position = 'fixed';
  el.style.opacity  = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  showToast('✅ ' + token + ' copiado al portapapeles');
}

// ─────────────────────────────────────────────────────
//  RENDER — Tarjeta individual
// ─────────────────────────────────────────────────────
function renderSignalCard(s) {
  var badgeClass = s.strength === 'strong' ? 'badge-strong'
                 : s.strength === 'medium' ? 'badge-medium' : 'badge-weak';
  var badgeLabel = s.strength === 'strong' ? '🔥 Fuerte'
                 : s.strength === 'medium' ? '📈 Media'   : '📊 Débil';
  var barClass   = s.score >= 82 ? 'fill-green'
                 : s.score >= 65 ? 'fill-yellow'           : 'fill-red';
  var pnlUp      = s.change24h >= 0;
  var chainIcon  = CHAIN_EMOJI[s.chain] || '🔗';

  var sec     = Math.floor((Date.now() - new Date(s.timestamp)) / 1000);
  var timeAgo = sec < 60
    ? sec + 's'
    : sec < 3600
      ? Math.floor(sec / 60) + 'm'
      : Math.floor(sec / 3600) + 'h';

  var shortAddr = s.address
    ? s.address.slice(0,6) + '...' + s.address.slice(-4)
    : 'Sin dirección';

  var sourceTag = s.isDemo
    ? '<span class="source-tag demo">⚠️ DEMO</span>'
    : '<span class="source-tag real">✅ fomo.family</span>';

  // Limpiar para usar en onclick
  var safeAddress = s.address.replace(/'/g, '').replace(/"/g, '');
  var safeToken   = s.token.replace(/'/g, '').replace(/"/g, '');

  // Imagen del token si está disponible
  var tokenIcon = s.image
    ? '<img src="' + s.image + '" width="36" height="36" style="border-radius:50%;object-fit:cover;" onerror="this.style.display=\'none\'" />'
    : '<div class="token-icon">' + s.emoji + '</div>';

  return '' +
    '<article class="signal-card ' + s.strength + '" data-chain="' + s.chain + '" data-id="' + s.id + '">' +

      '<div class="signal-header">' +
        '<div class="signal-token">' +
          tokenIcon +
          '<div>' +
            '<div class="token-name">' +
              '<span class="rank-badge">#' + s.rank + '</span> ' +
              s.token + ' ' +
              '<span class="chain-mini">' + chainIcon + ' ' + s.chain + '</span>' +
            '</div>' +
            '<button class="address-btn" onclick="copyAddress(\'' + safeAddress + '\',\'' + safeToken + '\')" title="Copiar dirección del contrato">' +
              '<span class="address-text">' + shortAddr + '</span>' +
              '<span class="copy-icon">📋</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<span class="signal-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
      '</div>' +

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
          '<span class="signal-stat-label">Volumen 24h</span>' +
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

      '<div class="signal-bar-wrap">' +
        '<div class="signal-bar-label">' +
          '<span>Momentum fomo.family</span>' +
          '<span>' + Math.round(s.momentum) + '%</span>' +
        '</div>' +
        '<div class="signal-bar">' +
          '<div class="signal-bar-fill ' + barClass + '" style="width:' + Math.round(s.momentum) + '%"></div>' +
        '</div>' +
      '</div>' +

      (s.address ?
        '<div class="full-address-wrap">' +
          '<span class="full-address-label">Contrato:</span>' +
          '<span class="full-address">' + s.address + '</span>' +
          '<button class="btn-copy-full" onclick="copyAddress(\'' + safeAddress + '\',\'' + safeToken + '\')">📋 Copiar</button>' +
        '</div>'
      : '') +

      '<div class="signal-footer">' +
        '<span>🕐 hace ' + timeAgo + '</span>' +
        sourceTag +
        '<span>👥 ' + s.holders.toLocaleString() + ' holders</span>' +
      '</div>' +

    '</article>';
}

// ─────────────────────────────────────────────────────
//  RENDER — Grid completo
// ─────────────────────────────────────────────────────
function renderSignals() {
  var grid = document.getElementById('signalsGrid');
  var list = allSignals;

  if      (currentFilter === 'strong') list = allSignals.filter(function(s) { return s.strength === 'strong'; });
  else if (currentFilter !== 'all')   list = allSignals.filter(function(s) { return s.chain === currentFilter; });

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
  var strong  = allSignals.filter(function(s) { return s.strength === 'strong'; });
  var best    = allSignals[0];
  var winRate = allSignals.length
    ? Math.round((strong.length / allSignals.length) * 100) : 0;
  var now = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });

  document.getElementById('totalSignals').textContent = allSignals.length;
  document.getElementById('winRate').textContent      = winRate + '%';
  document.getElementById('bestSignal').textContent   = best ? best.token + ' #' + best.rank : '—';
  document.getElementById('lastUpdate').textContent   = now;
}

// ─────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────
function showToast(msg, duration) {
  duration  = duration || 2800;
  var t     = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, duration);
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
        document.getElementById('statusDot').className   = 'status-dot online';
        document.getElementById('statusText').textContent = '✅ fomo.family en vivo';
        showToast('✅ ' + signals.length + ' señales reales de fomo.family');
      }
    })
    .catch(function(err) {
      console.error('Error critico:', err);
      loading.style.display = 'none';
      grid.style.display    = 'grid';
      allSignals = generateDemoSignals();
      updateStats();
      renderSignals();
      document.getElementById('statusDot').className   = 'status-dot offline';
      document.getElementById('statusText').textContent = '❌ Error';
    });
}

// ─────────────────────────────────────────────────────
//  INICIALIZAR
// ─────────────────────────────────────────────────────
function init() {
  loadData(true);
  refreshTimer = setInterval(function() { loadData(false); }, REFRESH_MS);

  // Botón refresh
  var btn = document.getElementById('btnRefresh');
  if (btn) {
    btn.addEventListener('click', function() {
      btn.classList.add('spinning');
      setTimeout(function() { btn.classList.remove('spinning'); }, 600);
      clearInterval(refreshTimer);
      loadData(false);
      refreshTimer = setInterval(function() { loadData(false); }, REFRESH_MS);
    });
  }

  // Tabs de boards
  document.querySelectorAll('[data-tab]').forEach(function(b) {
    b.addEventListener('click', function() {
      document.querySelectorAll('[data-tab]')
        .forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      currentTab = b.dataset.tab;
      loadData(true);
    });
  });

  // Filtros de cadena
  document.querySelectorAll('.filter-btn').forEach(function(b) {
    b.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn')
        .forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      currentFilter = b.dataset.filter;
      renderSignals();
    });
  });
}

// Exponer copyAddress globalmente
window.copyAddress = copyAddress;

document.addEventListener('DOMContentLoaded', init);
