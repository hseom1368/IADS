/**
 * viz/threat-info-panel.js — 위협 클릭 시 열리는 상세 정보 패널
 *
 * 구조:
 * - 화면에 DOM 패널 1개 생성 (좌측 HUD 아래, 기본 숨김)
 * - 위협 클릭 시 open(threatId) → 닫기 버튼 또는 ESC로 close()
 * - 열려있는 동안 updateLive(engine) 호출하여 실시간 수치 갱신
 *
 * 표시 정보:
 * - 기본: ID, 타입, 상태, 비행 진행률
 * - 실시간: 고도 (km), 속도 (m/s & Mach), 잔여 거리 (km), 현재 비행 단계, RCS
 * - 텔레메트리 요약: 샘플 수, 최대 고도, 최대 속도 (피크)
 *
 * 향후 확장: 시간-고도/거리/속도 스파크라인 또는 Chart.js 차트 부착
 */

import { getLatestSample } from '../core/telemetry.js';

const PANEL_ID = 'threatInfoPanel';
const PANEL_CSS_INJECTED = 'threatInfoPanelCssInjected';

/**
 * 패널용 CSS를 <head>에 한 번만 주입
 */
function injectCss() {
  if (document.getElementById(PANEL_CSS_INJECTED)) return;
  const style = document.createElement('style');
  style.id = PANEL_CSS_INJECTED;
  style.textContent = `
    #${PANEL_ID} {
      position: absolute;
      top: 12px;
      left: 268px;
      width: 270px;
      max-height: calc(100vh - 60px);
      overflow-y: auto;
      background: rgba(0,4,2,0.93);
      border: 1px solid rgba(255,68,68,0.45);
      color: #ff8888;
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      z-index: 150;
      display: none;
      box-shadow: 0 0 14px rgba(255,68,68,0.18);
    }
    #${PANEL_ID}.open { display: block; }
    #${PANEL_ID} .tp-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,68,68,0.28);
      background: rgba(255,68,68,0.08);
    }
    #${PANEL_ID} .tp-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 8px;
      letter-spacing: 2px;
      color: #ff4444;
    }
    #${PANEL_ID} .tp-close {
      background: transparent;
      border: 1px solid rgba(255,68,68,0.4);
      color: #ff4444;
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      width: 18px;
      height: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 0;
    }
    #${PANEL_ID} .tp-close:hover {
      background: rgba(255,68,68,0.15);
    }
    #${PANEL_ID} .tp-body { padding: 10px 12px; }
    #${PANEL_ID} .tp-section {
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px dashed rgba(255,68,68,0.15);
    }
    #${PANEL_ID} .tp-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    #${PANEL_ID} .tp-section h4 {
      font-family: 'Orbitron', sans-serif;
      font-size: 7px;
      letter-spacing: 2px;
      color: rgba(255,136,136,0.65);
      margin-bottom: 6px;
    }
    #${PANEL_ID} .tp-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    #${PANEL_ID} .tp-row .k { color: rgba(255,136,136,0.55); }
    #${PANEL_ID} .tp-row .v { color: #ffbbbb; font-weight: bold; }
    #${PANEL_ID} .tp-row .v.gn { color: #00ff88; }
    #${PANEL_ID} .tp-row .v.yl { color: #ffcc00; }
    #${PANEL_ID} .tp-progress {
      width: 100%;
      height: 4px;
      background: rgba(255,68,68,0.15);
      border: 1px solid rgba(255,68,68,0.28);
      margin-top: 3px;
    }
    #${PANEL_ID} .tp-progress > div {
      height: 100%;
      background: #ff4444;
      transition: width 0.2s linear;
    }
    #${PANEL_ID} .tp-hint {
      color: rgba(255,136,136,0.4);
      font-style: italic;
      font-size: 8px;
      text-align: center;
      padding: 4px 0;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 숫자 포맷 헬퍼
 */
function fmt(v, digits = 1, fallback = '—') {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  return v.toFixed(digits);
}

/**
 * 비행 단계 → 이름
 */
const FLIGHT_PHASE_NAMES = ['BOOST', 'MIDCOURSE', 'TERMINAL'];

export class ThreatInfoPanel {
  constructor() {
    injectCss();

    /** @type {HTMLElement} */
    this.el = document.createElement('div');
    this.el.id = PANEL_ID;
    this.el.innerHTML = `
      <div class="tp-head">
        <div class="tp-title">&#x25B8; THREAT INFO</div>
        <button class="tp-close" title="Close (ESC)">&#x2715;</button>
      </div>
      <div class="tp-body">
        <div class="tp-hint">Click a threat to inspect.</div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.bodyEl = this.el.querySelector('.tp-body');
    this.closeBtn = this.el.querySelector('.tp-close');

    this.closeBtn.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });

    /** @type {string|null} */
    this.currentThreatId = null;
    /** @type {import('../core/sim-engine.js').SimEngine|null} */
    this.engineRef = null;
  }

  /** @returns {boolean} */
  isOpen() {
    return this.el.classList.contains('open');
  }

  /**
   * 위협 패널 열기
   * @param {string} threatId
   * @param {import('../core/sim-engine.js').SimEngine} engine
   */
  open(threatId, engine) {
    this.currentThreatId = threatId;
    this.engineRef = engine;
    this.el.classList.add('open');
    this.render();
  }

  /** 패널 닫기 */
  close() {
    this.el.classList.remove('open');
    this.currentThreatId = null;
    this.bodyEl.innerHTML = '<div class="tp-hint">Click a threat to inspect.</div>';
  }

  /**
   * 실시간 수치 갱신 (프레임 루프에서 호출)
   * @param {import('../core/sim-engine.js').SimEngine} engine
   */
  updateLive(engine) {
    if (!this.isOpen() || !this.currentThreatId) return;
    this.engineRef = engine;
    this.render();
  }

  /**
   * 현재 상태 기반 DOM 재렌더
   * @private
   */
  render() {
    if (!this.engineRef || !this.currentThreatId) return;

    const threat = this.engineRef.threats.find(t => t.id === this.currentThreatId);
    if (!threat) {
      this.bodyEl.innerHTML = '<div class="tp-hint">Threat no longer exists.</div>';
      return;
    }

    const latest = getLatestSample(threat);
    const altKm = latest ? latest.altKm : threat.position.alt / 1000;
    const speedMs = latest ? latest.speed : threat.currentSpeed;
    const mach = speedMs / 340;
    const rangeKm = latest ? latest.rangeToTargetKm : null;
    const phaseName = FLIGHT_PHASE_NAMES[threat.flightPhase] || `PHASE ${threat.flightPhase}`;

    // 텔레메트리 피크
    let peakAlt = 0, peakSpeed = 0;
    for (const s of threat.telemetry) {
      if (s.altKm > peakAlt) peakAlt = s.altKm;
      if (s.speed > peakSpeed) peakSpeed = s.speed;
    }

    const progressPct = (threat.progress * 100).toFixed(0);
    const stateColorClass = {
      'flying': 'yl',
      'detected': 'yl',
      'engaging': '',
      'intercepted': 'gn',
      'leaked': '',
      'destroyed': '',
    }[threat.state] || '';

    this.bodyEl.innerHTML = `
      <div class="tp-section">
        <h4>IDENTITY</h4>
        <div class="tp-row"><span class="k">ID</span><span class="v">${threat.id}</span></div>
        <div class="tp-row"><span class="k">TYPE</span><span class="v">${threat.typeId}</span></div>
        <div class="tp-row"><span class="k">STATE</span><span class="v ${stateColorClass}">${threat.state.toUpperCase()}</span></div>
        <div class="tp-row"><span class="k">PHASE</span><span class="v">${phaseName}</span></div>
      </div>
      <div class="tp-section">
        <h4>KINEMATICS (LIVE)</h4>
        <div class="tp-row"><span class="k">ALT</span><span class="v">${fmt(altKm, 1)} km</span></div>
        <div class="tp-row"><span class="k">SPD</span><span class="v">${fmt(speedMs, 0)} m/s</span></div>
        <div class="tp-row"><span class="k">MACH</span><span class="v">M ${fmt(mach, 2)}</span></div>
        <div class="tp-row"><span class="k">RANGE TO TGT</span><span class="v">${fmt(rangeKm, 1)} km</span></div>
        <div class="tp-row"><span class="k">RCS</span><span class="v">${fmt(threat.currentRCS, 2)} m²</span></div>
      </div>
      <div class="tp-section">
        <h4>PROGRESS</h4>
        <div class="tp-row"><span class="k">FLIGHT</span><span class="v">${progressPct}%</span></div>
        <div class="tp-progress"><div style="width:${progressPct}%"></div></div>
      </div>
      <div class="tp-section">
        <h4>TELEMETRY BUFFER</h4>
        <div class="tp-row"><span class="k">SAMPLES</span><span class="v">${threat.telemetry.length}</span></div>
        <div class="tp-row"><span class="k">PEAK ALT</span><span class="v">${fmt(peakAlt, 1)} km</span></div>
        <div class="tp-row"><span class="k">PEAK SPD</span><span class="v">${fmt(peakSpeed / 340, 2)} Mach</span></div>
        <div class="tp-hint">Ring buffer ready for time-series graphs.</div>
      </div>
    `;
  }
}
