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

// ── 킬체인 HUD DOM 매핑 ──
// KILLCHAIN_STAGES: [GP_TO_KAMD(0), KAMD_PROCESSING(1), KAMD_TO_ICC(2), ICC_PROCESSING(3), ICC_TO_ECS(4), ECS_PROCESSING(5)]
// DOM 매핑: kc-gp(0~1완료), kc-kamd(1완료), kc-icc(2~3완료), kc-ecs(4~5완료), kc-fire(ready_to_engage)
const KC_DOM_MAP = [
  { domId: 'kc-gp',   activateAt: 0, doneAt: 1 },   // GP_TO_KAMD 진행 시 active, KAMD_PROCESSING 시작 시 done
  { domId: 'kc-kamd', activateAt: 1, doneAt: 2 },   // KAMD_PROCESSING 진행 시 active
  { domId: 'kc-icc',  activateAt: 3, doneAt: 4 },   // ICC_PROCESSING 진행 시 active
  { domId: 'kc-ecs',  activateAt: 5, doneAt: 6 },   // ECS_PROCESSING 진행 시 active
  { domId: 'kc-fire', activateAt: 6, doneAt: 7 }    // ready_to_engage 시 firing
];

/**
 * 킬체인 진행 상태 HUD를 업데이트한다. 매 프레임 호출.
 * @param {import('../core/killchain.js').LinearKillChain} killchain
 * @param {number} simTime
 */
export function updateKillchainHud(killchain, simTime) {
  // 첫 번째 활성 위협의 킬체인 상태를 찾는다
  let activeState = null;
  const readyList = killchain.getReadyToEngage();
  if (readyList.length > 0) {
    activeState = readyList[0];
  } else {
    // in_progress인 것을 찾는다
    // getState는 threatId가 필요하므로 모든 위협을 순회해야 함
    // _states에 직접 접근은 못하므로 외부에서 threatId를 전달받아야 함
    // → updateKillchainHudForThreat에서 처리
  }

  // 활성 상태가 없으면 모든 DOM 초기화
  if (!activeState) {
    _resetKillchainDom();
  } else {
    _applyKillchainState(activeState, simTime);
  }
}

/**
 * 특정 위협의 킬체인 상태로 HUD를 업데이트한다.
 * @param {import('../core/killchain.js').LinearKillChain} killchain
 * @param {string} threatId
 * @param {number} simTime
 */
export function updateKillchainHudForThreat(killchain, threatId, simTime) {
  const state = killchain.getState(threatId);
  if (!state) {
    _resetKillchainDom();
    return;
  }
  _applyKillchainState(state, simTime);
}

/**
 * 킬체인 상태를 DOM에 반영한다.
 * @param {Object} state - { currentStageIndex, stageStartTime, stageDuration, status }
 * @param {number} simTime
 * @private
 */
function _applyKillchainState(state, simTime) {
  const { currentStageIndex, stageStartTime, stageDuration, status } = state;

  for (const mapping of KC_DOM_MAP) {
    const el = document.getElementById(mapping.domId);
    if (!el) continue;

    const stEl = el.querySelector('.kc-st');
    el.classList.remove('active', 'done', 'firing');

    if (status === 'completed') {
      el.classList.add('done');
      if (stEl) stEl.textContent = '✓';
    } else if (status === 'ready_to_engage') {
      if (mapping.domId === 'kc-fire') {
        el.classList.add('firing');
        if (stEl) stEl.textContent = 'FIRE';
      } else {
        el.classList.add('done');
        if (stEl) stEl.textContent = '✓';
      }
    } else if (status === 'in_progress') {
      if (currentStageIndex >= mapping.doneAt) {
        el.classList.add('done');
        if (stEl) stEl.textContent = '✓';
      } else if (currentStageIndex >= mapping.activateAt) {
        el.classList.add('active');
        const elapsed = simTime - stageStartTime;
        if (stEl) stEl.textContent = `${elapsed.toFixed(0)}s`;
      } else {
        if (stEl) stEl.textContent = '—';
      }
    } else {
      if (stEl) stEl.textContent = '—';
    }
  }
}

/**
 * 킬체인 DOM을 초기 상태로 리셋한다.
 * @private
 */
function _resetKillchainDom() {
  for (const mapping of KC_DOM_MAP) {
    const el = document.getElementById(mapping.domId);
    if (!el) continue;
    el.classList.remove('active', 'done', 'firing');
    const stEl = el.querySelector('.kc-st');
    if (stEl) stEl.textContent = '—';
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
