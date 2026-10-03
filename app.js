'use strict';

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(r  => console.log('✅ SW:', r.scope))
      .catch(e => console.warn('SW error:', e));
  });
}

// ── Estado global ──
const REFRESH_MS    = 120000;
let   currentFilter = 'all';
let   refreshTimer  = null;
let   allSignals    = [];
let   currentTab    = 'trending';

const CHAIN_EMOJI = {
  SOL: '◎', ETH: 'Ξ', BASE: '🔵',
  BNB: '🟡', MONAD: '🟣', RH: '🔴',
};

// ── Datos DEMO (plan B si la API falla) ──
function generateDemoSignals() {
  const DEMO = [
    { token:'BONK',   address:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', chain:'SOL',  emoji:'🐕' },
    { token:'WIF',    address:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', chain:'SOL',  emoji:'🐶' },
    { token:'POPCAT', address:'7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', chain:'SOL',  emoji:'🐱' },
    { token:'BRETT',  address:'0x532f27101965dd16442e59d40670faf5ebb142e4',     chain:'BASE', emoji:'🐸' },
    { token:'DEGEN',  address:'0x4ed4e862860bed51a9570b96d89af5e1b0efefed',     chain:'BASE', emoji:'🎰' },
    { token:'PEPE',   address:'0x6982508145454ce325ddbe47a25d4ec3d2311933',     chain:'ETH',  emoji:'🐸' },
    { token:'SHIB',   address:'0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',     chain:'ETH',  emoji:'🐕' },
    { token:'FLOKI',  address:'0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',     chain:'BNB',  emoji:'⚡' },
  ];
  return DEMO.map((t, i) => {
    const score    = Math.floor(Math.random() * 35) + 60;
    const strength = score >= 82 ? 'strong' : score >= 68 ? 'medium' : 'weak';
    return {
      id: `demo-${t.token}-${i}`,
      rank: i + 1,
      token: t.token, name: t.token,
      address: t.address, chain: t.chain, emoji: t.emoji,
      strength, score,
      change24h: parseFloat((Math.random() * 80 - 10).toFixed(1)),
      price: (Math.random() * 0.01).toFixed(6),
      mcap: parseFloat((Math.random() * 50 + 1).toFixed(1)),
      holders: Math.floor(Math.random() * 5000 + 500),
      momentum: Math.floor(Math.random() * 30 + 60),
      timestamp: new Date(),
      isDemo: true,
    };
  }).sort((a, b) => b.score - a.score);
}

// ── Fetch datos reales de fomo.family ──
async function fetchFomoTokens(board) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className   = 'status-dot';
  txt.textContent = 'Conectando a fomo.family...';

  try {
    const res = await fetch(`/api/fomo?type=${board}&limit=30`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.hint) showToast('⚙️ ' + err.hint, 6000);
      throw new Error('Proxy error ' + res.status);
    }

    const data = await res.json();

    if (data.available === false) {
      throw new Error('Board no disponible aún');
    }

    const tokens = data.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new Error('Sin tokens en la respuesta');
    }

    const emojiMap = {
      BONK:'🐕', WIF:'🐶', POPCAT:'🐱', BRETT:'🐸', DEGEN:'🎰',
      PEPE:'🐸', SHIB:'🐕', FLOKI:'⚡', TURBO:'🚀', BOME:'💣',
      MON:'🟣', BABYDOGE:'🐶', CAKE:'🎂', TOSHI:'🐱', NORMIE:'😐',
    };

    const chainMap = {
      BASE:'BASE', SOLANA:'SOL', SOL:'SOL',
      ETHEREUM:'ETH', ETH:'ETH',
      BNB:'BNB', BSCMAINNET:'BNB', MONAD:'MONAD', RH:'RH',
    };

    return tokens.map((t, i) => {
      const symbol   = (t.token && t.token.symbol  ? t.token.symbol  : '???').toUpperCase();
      const name     =  t.token && t.token.name    ? t.token.name    : symbol;
      const address  =  t.token && t.token.address ? t.token.address : '';
      const network  = (t.network || 'SOL').toUpperCase();
      const chain    = chainMap[network] || network.slice(0, 5);
      const holders  = t.holders      || 0;
      const change24 = t.change24h    || 0;
      const mcap     = t.marketCapUsd || 0;
      const price    = t.priceUsd     || 0;
      const rank     = t.rank         || (i + 1);

      const rankScore   = Math.max(0, 30 - rank);
      const changeScore = Math.min(35, Math.max(0, change24 * 0.8));
      const holderScore = Math.min(20, holders / 100);
      const mcapScore   = mcap < 50000000 ? 15 : 8;
      const score       = Math.round(Math.min(100, 10 + rankScore + changeScore + holderScore + mcapScore));
      const strength    = score >= 80 ? 'strong' : score >= 62 ? 'medium' : 'weak';

      return {
        id:        'fomo-' + (address || i) + '-' + Date.now(),
        rank, token: symbol, name, address, chain,
        emoji:     emojiMap[symbol] || (CHAIN_EMOJI[chain] || '💎'),
        strength,  score,
        change24h: parseFloat(change24.toFixed(2)),
        price:     price < 0.001 ? price.toExponential(2) : price.toFixed(price < 1 ? 6 : 4),
        mcap:      parseFloat((mcap / 1000000).toFixed(1)),
        holders,
        momentum:  Math.min(98, Math.max(25, score + (Math.random() * 6 - 3))),
        timestamp: new Date(data.capturedAt || Date.now()),
        isDemo:    false,
      };
    }).sort((a, b) => a.rank - b.rank);

  } catch (err) {
    console.warn('fomoapi.io no disponible:', err.message);
    document.getElementById('statusDot').className = 'status-dot offline';
    document.getElementById('statusText').textContent = '⚠️ Demo (API no disponible)';
    showToast('⚠️ Mostrando datos demo — configura tu API Key en Vercel', 5000);
    return generateDemoSignals();
  }
}

// ── Copiar dirección al portapapeles ──
function copyAddress(address, token) {
  if (!address) {
    showToast('⚠️ Este token no tiene dirección disponible', 3000);
    return;
  }
  navigator.clipboard.writeText(address)
    .then(() => {
      showToast('✅ ' + token + ' copiado: ' + address.slice(0,6) + '...' + address.slice(-4));
    })
    .catch(() => {
      const el = document.createElement('textarea');
      el.value = address;
      el.style.position = 'fixed';
      el.style.opacity  = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('✅ ' + token + ' copiado al portapapeles');
    });
}

// ── Render tarjeta ──
function renderSignalCard(s) {
  const badgeClass = s.strength === 'strong' ? 'badge-strong'
                   : s.strength === 'medium' ? 'badge-medium' : 'badge-weak';
  const badgeLabel = s.strength === 'strong' ? '🔥 Fuerte'
                   : s.strength === 'medium' ? '📈 Media'   : '📊 Débil';
  const barClass   = s.score >= 82 ? 'fill-green'
                   : s.score >= 65 ? 'fill-yellow'          : 'fill-red';
  const pnlUp      = s.change24h >= 0;

  const sec     = Math.floor((Date.now() - new Date(s.timestamp)) / 1000);
  const timeAgo = sec < 60 ? sec + 's' : sec < 3600 ? Math.floor(sec/60) + 'm' : Math.floor(sec/3600) + 'h';

  const shortAddr = s.address
    ? s.address.slice(0,6) + '...' + s.address.slice(-4)
    : 'Sin dirección';

  const sourceTag = s.isDemo
    ? '<span class="source-tag demo">⚠️ DEMO</span>'
    : '<span class="source-tag real">✅ fomo.family</span>';

  const safeAddress = s.address ? s.address.replace(/'/g, '') : '';
  const safeToken   = s.token.replace(/'/g, '');

  return `
    <article class="signal-card ${s.strength}" data-chain="${s.chain}" data-id="${s.id}">

      <div class="signal-header">
        <div class="signal-token">
          <div class="token-icon">${s.emoji}</div>
          <div>
            <div class="token-name">
              #${s.rank} ${s.token}
              <span class="chain-mini">${CHAIN_EMOJI[s.chain] || ''} ${s.chain}</span>
            </div>
            <button
              class="address-btn"
              onclick="copyAddress('${safeAddress}','${safeToken}')"
              title="Copiar dirección del contrato"
            >
              <span class="address-text">${shortAddr}</span>
              <span class="copy-icon">📋</span>
            </button>
          </div>
        </div>
        <span class="signal-badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="signal-stats">
        <div class="signal-stat">
          <span class="signal-stat-label">Cambio 24h</span>
          <span class="signal-stat-value ${pnlUp ? 'up' : 'down'}">
            ${pnlUp ? '+' : ''}${s.change24h}%
          </span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">Precio</span>
          <span class="signal-stat-value">$${s.price}</span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">MCap</span>
          <span class="signal-stat-value">$${s.mcap}M</span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">Holders</span>
          <span class="signal-stat-value">${s.holders.toLocaleString()}</span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">Score</span>
          <span class="signal-stat-value ${s.score>=80?'up':s.score>=62?'':'down'}">
            ${s.score}/100
          </span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">Rank</span>
          <span class="signal-stat-value">#${s.rank}</span>
        </div>
      </div>

      <div class="signal-bar-wrap">
        <div class="signal-bar-label">
          <span>Momentum fomo.family</span>
          <span>${Math.round(s.momentum)}%</span>
        </div>
        <div class="signal-bar">
          <div class="signal-bar-fill ${barClass}"
               style="width:${Math.round(s.momentum)}%"></div>
        </div>
      </div>

      ${s.address ? `
      <div class="full-address-wrap">
        <span class="full-address-label">Contrato:</span>
        <span class="full-address">${s.address}</span>
        <button
          class="btn-copy-full"
          onclick="copyAddress('${safeAddress}','${safeToken}')"
        >📋 Copiar</button>
      </div>` : ''}

      <div class="signal-footer">
        <span>🕐 hace ${timeAgo}</span>
        ${sourceTag}
        <span>👥 ${s.holders.toLocaleString()} holders</span>
      </div>

    </article>
  `;
}

// ── Render grid ──
function renderSignals() {
  const grid = document.getElementById('signalsGrid');
  let list   = allSignals;

  if      (currentFilter === 'strong') list = allSignals.filter(s => s.strength === 'strong');
  else if (currentFilter !== 'all')   list = allSignals.filter(s => s.chain === currentFilter);

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🔍</div>
        <p>Sin señales para este filtro.</p>
        <p style="font-size:12px">Prueba "Todas" o espera la próxima actualización.</p>
      </div>`;
    return;
  }
  grid.innerHTML = list.map(renderSignalCard).join('');
}

// ── Stats bar ──
function updateStats() {
  const strong  = allSignals.filter(s => s.strength === 'strong');
  const best    = allSignals[0];
  const winRate = allSignals.length
    ? Math.round((strong.length / allSignals.length) * 100) : 0;
  const now = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });

  document.getElementById('totalSignals').textContent = allSignals.length;
  document.getElementById('winRate').textContent      = winRate + '%';
  document.getElementById('bestSignal').textContent   = best ? best.token + ' #' + best.rank : '—';
  document.getElementById('lastUpdate').textContent   = now;
}

// ── Toast ──
function showToast(msg, duration) {
  duration = duration || 2800;
  const t  = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, duration);
}

// ── Cargar datos ──
function loadData(showSpinner) {
  const loading = document.getElementById('loadingState');
  const grid    = document.getElementById('signalsGrid');
  const dot     = document.getElementById('statusDot');
  const txt     = document.getElementById('statusText');

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
        dot.className   = 'status-dot online';
        txt.textContent = '✅ fomo.family en vivo';
        showToast('✅ ' + signals.length + ' señales reales de fomo.family');
      }
    })
    .catch(function(err) {
      console.error('Error crítico:', err);
      loading.style.display = 'none';
      grid.style.display    = 'grid';
      allSignals = generateDemoSignals();
      updateStats();
      renderSignals();
      dot.className   = 'status-dot offline';
      txt.textContent = '❌ Error';
    });
}

// ── Inicializar ──
function init() {
  loadData(true);
  refreshTimer = setInterval(function() { loadData(false); }, REFRESH_MS);

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

  document.querySelectorAll('[data-tab]').forEach(function(b) {
    b.addEventListener('click', function() {
      document.querySelectorAll('[data-tab]')
        .forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      currentTab = b.dataset.tab;
      loadData(true);
    });
  });

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

window.copyAddress = copyAddress;
document.addEventListener('DOMContentLoaded', init);
