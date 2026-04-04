/**
 * @module viz/hud
 * HUD 오버레이 — HTML 기반, Cesium 렌더링과 독립
 * SimEngine 이벤트를 구독하여 동적 업데이트
 */

const MAX_LOG_ENTRIES = 14;

/** @type {HTMLElement|null} */
let _logEl = null;
/** @type {HTMLElement|null} */
let _launcherEl = null;
/** @type {HTMLElement|null} */
let _simTimeEl = null;
/** @type {HTMLElement|null} */
let _simStateEl = null;

/**
 * HUD를 초기화하고 SimEngine 이벤트를 구독한다.
 * @param {import('../core/sim-engine.js').SimEngine} [engine] - 이벤트 구독용
 */
export function initHud(engine) {
  _logEl = document.getElementById('log');
  _launcherEl = document.getElementById('launcherHud');
  _simTimeEl = document.getElementById('simTime');
  _simStateEl = document.getElementById('simState');

  if (engine) {
    engine.on('threat-detected', (d) =>
      addLogEntry(`위협 탐지: ${d.threatId}`, '#44aaff'));
    engine.on('engagement-start', (d) =>
      addLogEntry(`교전 개시: Pk=${(d.pk * 100).toFixed(0)}%`, '#00ff88'));
    engine.on('intercept-hit', (d) =>
      addLogEntry(`요격 성공! ${d.threatId}`, '#00ff88'));
    engine.on('intercept-miss', (d) =>
      addLogEntry(`요격 실패 ${d.threatId}`, '#ff4444'));
    engine.on('threat-leaked', (d) =>
      addLogEntry(`위협 관통! ${d.threatId}`, '#ff4444'));
    engine.on('simulation-end', (d) =>
      addLogEntry(`시뮬레이션 종료 — 격추:${d.destroyed} 관통:${d.leaked}`, '#ffcc00'));
  }
}

/**
 * HUD를 SimEngine 현재 상태로 업데이트한다. 매 프레임 호출.
 * @param {import('../core/sim-engine.js').SimEngine} engine
 */
export function updateHud(engine) {
  // 시뮬레이션 시간
  if (_simTimeEl) {
    _simTimeEl.textContent = engine.simTime.toFixed(1) + 's';
  }

  // 시뮬레이션 상태
  if (_simStateEl) {
    _simStateEl.textContent = engine.state;
    _simStateEl.className = engine.state === 'RUNNING' ? 'gn'
      : engine.state === 'COMPLETE' ? 'rd' : 'yl';
  }

  // 발사대 현황
  if (_launcherEl) {
    const shooters = engine.getAllShooters();
    _launcherEl.innerHTML = shooters.map(s => {
      const cap = engine._registry.getShooterCapability(s.typeId);
      const totalPips = cap ? cap.ammoCount : 6;
      const pips = Array.from({ length: totalPips }, (_, i) => {
        const cls = i < s.currentAmmo
          ? (s.status === 'engaged' ? 'pip' : 'pip')
          : 'pip e';
        return `<div class="${cls}"></div>`;
      }).join('');

      const statusColor = s.status === 'ready' ? 'gn'
        : s.status === 'engaged' ? 'yl'
        : s.status === 'out_of_ammo' ? 'rd' : 'yl';

      return `<div class="lrow">
        <span class="lnm">${s.typeId}</span>
        <div class="pips">${pips}</div>
        <span class="lst ${statusColor}">${s.status.toUpperCase()}</span>
      </div>`;
    }).join('');
  }
}

/**
 * 교전 로그에 항목을 추가한다.
 * @param {string} message
 * @param {string} [color='#00ff88']
 */
export function addLogEntry(message, color = '#00ff88') {
  if (!_logEl) return;

  const time = new Date().toISOString().substring(11, 19);
  const entry = document.createElement('div');
  entry.style.color = color;
  entry.style.marginBottom = '1px';
  entry.textContent = `[${time}] ${message}`;

  _logEl.insertBefore(entry, _logEl.firstChild);

  // 최대 항목 수 제한
  while (_logEl.children.length > MAX_LOG_ENTRIES) {
    _logEl.removeChild(_logEl.lastChild);
  }
}
