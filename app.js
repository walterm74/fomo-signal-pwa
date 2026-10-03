/* ═══════════════════════════════════════════
   FOMO Smart Signal Dashboard — app.js
   VERSIÓN CORREGIDA — Datos reales + fallback
   ═══════════════════════════════════════════ */

'use strict';

// ── Registrar Service Worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ SW registrado:', reg.scope))
      .catch(err => console.error('❌ SW error:', err));
  });
}

// ── Constantes ──
const REFRESH_INTERVAL = 60000; // 60 segundos (evita límite de API)
let   currentFilter    = 'all';
let   refreshTimer     = null;
let   allSignals       = [];

// ── Tokens base ──
const TOKEN_POOL = [
  { name: 'BONK',     chain: 'SOL',   emoji: '🐕' },
  { name: 'WIF',      chain: 'SOL',   emoji: '🐶' },
  { name: 'POPCAT',   chain: 'SOL',   emoji: '🐱' },
  { name: 'BOME',     chain: 'SOL',   emoji: '💣' },
  { name: 'DEGEN',    chain: 'BASE',  emoji: '🎰' },
  { name: 'BRETT',    chain: 'BASE',  emoji: '🐸' },
  { name: 'TOSHI',    chain: 'BASE',  emoji: '🐱' },
  { name: 'NORMIE',   chain: 'BASE',  emoji: '😐' },
  { name: 'FLOKI',    chain: 'BNB',   emoji: '⚡' },
  { name: 'BABYDOGE', chain: 'BNB',   emoji: '🐶' },
  { name: 'CAKE',     chain: 'BNB',   emoji: '🎂' },
  { name: 'MON',      chain: 'MONAD', emoji: '🟣' },
  { name: 'SHIB',     chain: 'ETH',   emoji: '🐕' },
  { name: 'PEPE',     chain: 'ETH',   emoji: '🐸' },
  { name: 'TURBO',    chain: 'ETH',   emoji: '🚀' },
];

// ─────────────────────────────────────────────
//  ✅ FUNCIÓN 1: generateSignals()
//  Datos DEMO — se usa como fallback si la API falla
//  ⚠️ NO BORRAR — fetchRealSignals() la necesita
// ─────────────────────────────────────────────
function generateSignals() {
  const count   = Math.floor(Math.random() * 6) + 8;
  const signals = [];
  const used    = new Set();

  for (let i = 0; i < count; i++) {
    let token;
    do {
      token = TOKEN_POOL[Math.floor(Math.random() * TOKEN_POOL.length)];
    } while (used.has(token.name));
    used.add(token.name);

    const score    = Math.floor(Math.random() * 40) + 60;
    const strength = score >= 85 ? 'strong' : score >= 72 ? 'medium' : 'weak';
    const change1h = parseFloat((Math.random() * 30 - 5).toFixed(2));
    const change24h= parseFloat((Math.random() * 60 - 15).toFixed(2));
    const volume   = parseFloat((Math.random() * 9.5 + 0.5).toFixed(1));
    const mcap     = parseFloat((Math.random() * 95 + 5).toFixed(0));
    const holders  = Math.floor(Math.random() * 45000) + 5000;
    const momentum = Math.floor(Math.random() * 35) + 60;

    signals.push({
      id: `${token.name}-${Date.now()}-${i}`,
      token:    token.name,
      chain:    token.chain,
      emoji:    token.emoji,
      strength,
      score,
      change1h,
      change24h,
      volume,
      mcap,
      holders,
      momentum,
      timestamp: new Date(),
      isDemo: true,            // ← marca para mostrar aviso
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────
//  ✅ FUNCIÓN 2: fetchRealSignals()
//  Datos REALES desde CoinGecko API (gratis)
//  Si falla → llama a generateSignals() como plan B
// ─────────────────────────────────────────────
async function fetchRealSignals() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');

  dot.className   = 'status-dot';
  txt.textContent = 'Cargando datos reales...';

  try {
    const url =
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd' +
      '&ids=bonk,dogwifhat,popcat,book-of-meme,degen-base,' +
      'brett,toshi,floki,baby-doge-coin,shiba-inu,pepe,turbo' +
      '&order=volume_desc' +
      '&per_page=12' +
      '&sparkline=false' +
      '&price_change_percentage=1h,24h,7d';

    const response = await fetch(url);

    // Si la API responde con error (429 = demasiadas peticiones, etc.)
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const coins = await response.json();

    // Verificar que realmente llegaron datos
    if (!Array.isArray(coins) || coins.length === 0) {
      throw new Error('Sin datos de la API');
    }

    const chainMap = {
      'bonk': 'SOL', 'dogwifhat': 'SOL', 'popcat': 'SOL', 'book-of-meme': 'SOL',
      'degen-base': 'BASE', 'brett': 'BASE', 'toshi': 'BASE',
      'floki': 'BNB', 'baby-doge-coin': 'BNB',
      'shiba-inu': 'ETH', 'pepe': 'ETH', 'turbo': 'ETH',
    };

    const emojiMap = {
      'bonk': '🐕', 'dogwifhat': '🐶', 'popcat': '🐱', 'book-of-meme': '💣',
      'degen-base': '🎰', 'brett': '🐸', 'toshi': '🐱',
      'floki': '⚡', 'baby-doge-coin': '🐶',
      'shiba-inu': '🐕', 'pepe': '🐸', 'turbo': '🚀',
    };

    const signals = coins.map((coin, i) => {
      // Score basado en datos reales
      const turnover   = coin.total_volume / (coin.market_cap || 1);
      const volScore   = Math.min(40, turnover * 400);
      const priceScore = Math.min(30, Math.max(0, coin.price_change_percentage_24h_in_currency || 0));
      const mcapScore  = (coin.market_cap || 0) < 100_000_000 ? 20 : 10;
      const score      = Math.round(Math.min(100, 50 + volScore + priceScore / 3 + mcapScore));
      const strength   = score >= 80 ? 'strong' : score >= 65 ? 'medium' : 'weak';

      return {
        id:        `${coin.id}-${Date.now()}-${i}`,
        token:     coin.symbol.toUpperCase(),
        chain:     chainMap[coin.id] || 'ETH',
        emoji:     emojiMap[coin.id] || '💎',
        strength,
        score,
        change1h:  parseFloat((coin.price_change_percentage_1h_in_currency  || 0).toFixed(2)),
        change24h: parseFloat((coin.price_change_percentage_24h_in_currency || 0).toFixed(2)),
        volume:    parseFloat((coin.total_volume / 1_000_000).toFixed(1)),
        mcap:      parseFloat(((coin.market_cap || 0) / 1_000_000).toFixed(0)),
        holders:   Math.floor((coin.market_cap || 0) / 500),
        momentum:  Math.min(95, Math.max(30, score + (Math.random() * 10 - 5))),
        timestamp: new Date(),
        price:     coin.current_price || 0,
        isDemo:    false,       // ← datos reales
      };
    });

    return signals.sort((a, b) => b.score - a.score);

  } catch (error) {
    // ── PLAN B: si la API falla, usar datos demo ──
    console.warn('⚠️ API no disponible, usando datos demo:', error.message);
    dot.className   = 'status-dot offline';
    txt.textContent = '⚠️ Demo (API no disponible)';
    showToast('⚠️ API no disponible — mostrando datos demo');
    return generateSignals(); // ← AQUÍ NECESITA generateSignals()
  }
}

// ─────────────────────────────────────────────
//  RENDER — Tarjeta individual
// ─────────────────────────────────────────────
function renderSignalCard(s) {
  const badgeClass = s.strength === 'strong' ? 'badge-strong'
                   : s.strength === 'medium' ? 'badge-medium'
                   : 'badge-weak';

  const badgeLabel = s.strength === 'strong' ? '🔥 Fuerte'
                   : s.strength === 'medium' ? '📈 Media'
                   : '📊 Débil';

  const barClass = s.score >= 85 ? 'fill-green'
                 : s.score >= 70 ? 'fill-yellow'
                 : 'fill-red';

  const c1h  = s.change1h  >= 0;
  const c24h = s.change24h >= 0;

  const sec    = Math.floor((Date.now() - new Date(s.timestamp)) / 1000);
  const timeAgo = sec < 60
    ? `${sec}s`
    : sec < 3600
      ? `${Math.floor(sec / 60)}m`
      : `${Math.floor(sec / 3600)}h`;

  const demoTag = s.isDemo
    ? '<span style="color:#f59e0b;font-size:10px;">⚠️ DEMO</span>'
    : '<span style="color:#22c55e;font-size:10px;">✅ REAL</span>';

  return `
    <article class="signal-card ${s.strength}" data-chain="${s.chain}" data-id="${s.id}">

      <div class="signal-header">
        <div class="signal-token">
          <div class="token-icon">${s.emoji}</div>
          <div>
            <div class="token-name">${s.token}</div>
            <span class="token-chain">${s.chain}</span>
          </div>
        </div>
        <span class="signal-badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="signal-stats">
        <div class="signal-stat">
          <span class="signal-stat-label">1h</span>
          <span class="signal-stat-value ${c1h ? 'up' : 'down'}">
            ${c1h ? '+' : ''}${s.change1h}%
          </span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">24h</span>
          <span class="signal-stat-value ${c24h ? 'up' : 'down'}">
            ${c24h ? '+' : ''}${s.change24h}%
          </span>
        </div>
        <div class="signal-stat">
          <span class="signal-stat-label">Vol</span>
          <span class="signal-stat-value">$${s.volume}M</span>
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
          <span class="signal-stat-value ${s.score >= 85 ? 'up' : s.score >= 70 ? '' : 'down'}">
            ${s.score}
          </span>
        </div>
      </div>

      <div class="signal-bar-wrap">
        <div class="signal-bar-label">
          <span>Momentum</span>
          <span>${Math.round(s.momentum)}%</span>
        </div>
        <div class="signal-bar">
          <div class="signal-bar-fill ${barClass}"
               style="width:${Math.round(s.momentum)}%"></div>
        </div>
      </div>

      <div class="signal-footer">
        <span>🕐 hace ${timeAgo}</span>
        ${demoTag}
        <span>📡 Score: ${s.score}/100</span>
      </div>

    </article>
  `;
}

// ─────────────────────────────────────────────
//  RENDER — Grid completo con filtros
// ─────────────────────────────────────────────
function renderSignals() {
  const grid = document.getElementById('signalsGrid');

  let filtered = allSignals;

  if (currentFilter === 'strong') {
    filtered = allSignals.filter(s => s.strength === 'strong');
  } else if (currentFilter !== 'all') {
    filtered = allSignals.filter(s => s.chain === currentFilter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🔍</div>
        <p>No hay señales para este filtro ahora mismo.</p>
        <p style="font-size:12px">Prueba otro filtro o espera la próxima actualización.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(renderSignalCard).join('');
}

// ─────────────────────────────────────────────
//  STATS BAR
// ─────────────────────────────────────────────
function updateStats() {
  const strong  = allSignals.filter(s => s.strength === 'strong');
  const winRate = allSignals.length > 0
    ? Math.round((strong.length / allSignals.length) * 100)
    : 0;
  const best = allSignals[0];
  const now  = new Date().toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('totalSignals').textContent = allSignals.length;
  document.getElementById('winRate').textContent      = `${winRate}%`;
  document.getElementById('bestSignal').textContent   = best
    ? `${best.token} ${best.score}`
    : '—';
  document.getElementById('lastUpdate').textContent   = now;
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────────
//  CARGAR DATOS — Orquesta todo
// ─────────────────────────────────────────────
function loadData(showSpinner = false) {
  const loading = document.getElementById('loadingState');
  const grid    = document.getElementById('signalsGrid');
  const dot     = document.getElementById('statusDot');
  const txt     = document.getElementById('statusText');

  if (showSpinner) {
    loading.style.display = 'flex';
    grid.style.display    = 'none';
  }

  // Llama a datos reales (con fallback automático a demo si falla)
  fetchRealSignals()
    .then(signals => {
      allSignals = signals;

      loading.style.display = 'none';
      grid.style.display    = 'grid';

      updateStats();
      renderSignals();

      // Solo actualizar status si no está en modo offline/demo
      if (!signals[0]?.isDemo) {
        dot.className   = 'status-dot online';
        txt.textContent = '✅ Datos reales';
        showToast('✅ Señales reales actualizadas');
      }
    })
    .catch(err => {
      // Error inesperado (no debería llegar aquí por el try/catch interno)
      console.error('Error crítico:', err);
      loading.style.display = 'none';
      grid.style.display    = 'grid';
      allSignals = generateSignals();
      updateStats();
      renderSignals();
      dot.className   = 'status-dot offline';
      txt.textContent = '❌ Error';
    });
}

// ─────────────────────────────────────────────
//  INICIALIZAR APP
// ─────────────────────────────────────────────
function init() {
  // Carga inicial con spinner
  loadData(true);

  // Auto-refresh cada 60 segundos
  refreshTimer = setInterval(() => loadData(false), REFRESH_INTERVAL);

  // Botón refresh manual
  const btn = document.getElementById('btnRefresh');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.classList.add('spinning');
      setTimeout(() => btn.classList.remove('spinning'), 600);

      clearInterval(refreshTimer);
      loadData(false);
      refreshTimer = setInterval(() => loadData(false), REFRESH_INTERVAL);
    });
  }

  // Filtros
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn')
        .forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentFilter = b.dataset.filter;
      renderSignals();
    });
  });

  // Clic en tarjeta → info rápida
  const gridEl = document.getElementById('signalsGrid');
  if (gridEl) {
    gridEl.addEventListener('click', e => {
      const card = e.target.closest('.signal-card');
      if (!card) return;
      const sig = allSignals.find(s => s.id === card.dataset.id);
      if (sig) {
        const tipo = sig.isDemo ? '⚠️ DEMO' : '✅ REAL';
        showToast(`${sig.emoji} ${sig.token} — Score: ${sig.score}/100 | ${sig.chain} | ${tipo}`);
      }
    });
  }
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);