/* ═══════════════════════════════════════════
   FOMO Smart Signal Dashboard — app.js
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
const CHAINS   = ['SOL', 'BASE', 'BNB', 'MONAD', 'ETH'];
const REFRESH_INTERVAL = 30000; // 30 segundos
let   currentFilter    = 'all';
let   refreshTimer     = null;
let   allSignals       = [];

// ── Tokens simulados (base para generar señales realistas) ──
const TOKEN_POOL = [
  { name: 'BONK',   chain: 'SOL',   emoji: '🐕' },
  { name: 'WIF',    chain: 'SOL',   emoji: '🐶' },
  { name: 'POPCAT', chain: 'SOL',   emoji: '🐱' },
  { name: 'BOME',   chain: 'SOL',   emoji: '💣' },
  { name: 'DEGEN',  chain: 'BASE',  emoji: '🎰' },
  { name: 'BRETT',  chain: 'BASE',  emoji: '🐸' },
  { name: 'TOSHI',  chain: 'BASE',  emoji: '🐱' },
  { name: 'NORMIE', chain: 'BASE',  emoji: '😐' },
  { name: 'FLOKI',  chain: 'BNB',   emoji: '⚡' },
  { name: 'BABYDOGE', chain: 'BNB', emoji: '🐶' },
  { name: 'CAKE',   chain: 'BNB',   emoji: '🎂' },
  { name: 'MON',    chain: 'MONAD', emoji: '🟣' },
  { name: 'SHIB',   chain: 'ETH',   emoji: '🐕' },
  { name: 'PEPE',   chain: 'ETH',   emoji: '🐸' },
  { name: 'TURBO',  chain: 'ETH',   emoji: '🚀' },
];

// ─────────────────────────────────────────────
//  GENERADOR DE SEÑALES (datos demo realistas)
// ─────────────────────────────────────────────
function generateSignals() {
  const count   = Math.floor(Math.random() * 6) + 8; // 8–13 señales
  const signals = [];
  const used    = new Set();

  for (let i = 0; i < count; i++) {
    // Elegir token único
    let token;
    do { token = TOKEN_POOL[Math.floor(Math.random() * TOKEN_POOL.length)]; }
    while (used.has(token.name));
    used.add(token.name);

    // Generar datos de señal
    const score    = Math.floor(Math.random() * 40) + 60;      // 60–100
    const strength = score >= 85 ? 'strong' : score >= 72 ? 'medium' : 'weak';
    const change1h = (Math.random() * 30 - 5).toFixed(2);      // -5% a +25%
    const change24h= (Math.random() * 60 - 15).toFixed(2);     // -15% a +45%
    const volume   = (Math.random() * 9.5 + 0.5).toFixed(1);   // 0.5M–10M
    const mcap     = (Math.random() * 95 + 5).toFixed(0);      // 5M–100M
    const holders  = Math.floor(Math.random() * 45000) + 5000;
    const momentum = Math.floor(Math.random() * 35) + 60;      // 60–95

    signals.push({
      id:       `${token.name}-${Date.now()}-${i}`,
      token:    token.name,
      chain:    token.chain,
      emoji:    token.emoji,
      strength,
      score,
      change1h: parseFloat(change1h),
      change24h: parseFloat(change24h),
      volume:   parseFloat(volume),
      mcap:     parseFloat(mcap),
      holders,
      momentum,
      timestamp: new Date(),
    });
  }

  // Ordenar por score descendente
  return signals.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────
//  RENDER — Tarjeta de Señal
// ─────────────────────────────────────────────
function renderSignalCard(s) {
  const badgeClass = s.strength === 'strong' ? 'badge-strong'
                   : s.strength === 'medium' ? 'badge-medium'
                   : 'badge-weak';

  const badgeLabel = s.strength === 'strong' ? '🔥 Fuerte'
                   : s.strength === 'medium' ? '📈 Media'
                   : '📊 Débil';

  const barClass   = s.score >= 85 ? 'fill-green'
                   : s.score >= 70 ? 'fill-yellow'
                   : 'fill-red';

  const c1h  = s.change1h  >= 0;
  const c24h = s.change24h >= 0;

  const timeAgo = (() => {
    const sec = Math.floor((Date.now() - s.timestamp) / 1000);
    if (sec < 60)  return `${sec}s`;
    if (sec < 3600)return `${Math.floor(sec/60)}m`;
    return `${Math.floor(sec/3600)}h`;
  })();

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
          <span class="signal-stat-value ${s.score>=85?'up':s.score>=70?'':'down'}">
            ${s.score}
          </span>
        </div>
      </div>

      <div class="signal-bar-wrap">
        <div class="signal-bar-label">
          <span>Momentum</span>
          <span>${s.momentum}%</span>
        </div>
        <div class="signal-bar">
          <div class="signal-bar-fill ${barClass}" style="width:${s.momentum}%"></div>
        </div>
      </div>

      <div class="signal-footer">
        <span>🕐 hace ${timeAgo}</span>
        <span>💧 Liquidez OK</span>
        <span>📡 Score: ${s.score}/100</span>
      </div>

    </article>
  `;
}

// ─────────────────────────────────────────────
//  RENDER — Grid completo
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
        <p style="font-size:12px">Prueba otro filtro o actualiza en unos segundos.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(renderSignalCard).join('');
}

// ─────────────────────────────────────────────
//  ACTUALIZAR STATS BAR
// ─────────────────────────────────────────────
function updateStats() {
  const strong   = allSignals.filter(s => s.strength === 'strong');
  const winRate  = Math.round((strong.length / allSignals.length) * 100);
  const best     = allSignals[0];
  const now      = new Date().toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});

  document.getElementById('totalSignals').textContent = allSignals.length;
  document.getElementById('winRate').textContent      = `${winRate}%`;
  document.getElementById('bestSignal').textContent   = best ? `${best.token} ${best.score}` : '—';
  document.getElementById('lastUpdate').textContent   = now;
}

// ─────────────────────────────────────────────
//  CARGAR / REFRESCAR DATOS
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

  // Simular latencia de red
  setTimeout(() => {
    allSignals = generateSignals();

    loading.style.display = 'none';
    grid.style.display    = 'grid';

    updateStats();
    renderSignals();

    dot.className   = 'status-dot online';
    txt.textContent = 'En vivo';

    showToast('✅ Señales actualizadas');
  }, showSpinner ? 1200 : 400);
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─────────────────────────────────────────────
//  INICIALIZAR
// ─────────────────────────────────────────────
function init() {
  // Carga inicial
  loadData(true);

  // Auto-refresh
  refreshTimer = setInterval(() => loadData(false), REFRESH_INTERVAL);

  // Botón refresh manual
  const btn = document.getElementById('btnRefresh');
  btn.addEventListener('click', () => {
    btn.classList.add('spinning');
    setTimeout(() => btn.classList.remove('spinning'), 600);
    loadData(false);

    // Reiniciar timer
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadData(false), REFRESH_INTERVAL);
  });

  // Filtros
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentFilter = b.dataset.filter;
      renderSignals();
    });
  });

  // Clic en tarjeta
  document.getElementById('signalsGrid').addEventListener('click', e => {
    const card = e.target.closest('.signal-card');
    if (!card) return;
    const sig = allSignals.find(s => s.id === card.dataset.id);
    if (sig) showToast(`📊 ${sig.token} — Score: ${sig.score}/100 | ${sig.chain}`);
  });
}

document.addEventListener('DOMContentLoaded', init);