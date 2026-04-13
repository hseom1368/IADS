/**
 * viz/hud.js — HUD (Head-Up Display) 오버레이
 *
 * - 킬체인 진행 상태 (GREEN_PINE 탐지→KAMD 분석→ICC 명령→ECS 발사→BDA)
 * - 포대 상태 (L-SAM 탄약 잔여, 동시교전 현황)
 * - 교전 결과 로그 (PSSEK Pk값 표시)
 * - 시뮬레이션 시간, 상태
 */

const MAX_LOG_ENTRIES = 12;

export class HUD {
  constructor() {
    this.logEntries = [];
    this._buildDOM();
  }

  _buildDOM() {
    // 좌측 패널
    this.panel = document.getElementById('hud');
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="hbox">
        <h3>&#x25B8; KIDA ADSIM v2.0</h3>
        <div class="row"><span class="lbl">Architecture</span><span class="gn" id="hud-arch">LINEAR C2</span></div>
        <div class="row"><span class="lbl">Status</span><span class="yl" id="hud-status">READY</span></div>
        <div class="row"><span class="lbl">Sim Time</span><span class="bl" id="hud-time">0.0s</span></div>
        <div class="row"><span class="lbl">Threats</span><span class="rd" id="hud-threats">0</span></div>
      </div>
      <div class="hbox">
        <h3>&#x25B8; KILLCHAIN</h3>
        <div id="hud-killchain" style="font-size:8px;color:rgba(0,255,136,0.6);line-height:1.8"></div>
      </div>
      <div class="hbox">
        <h3>&#x25B8; L-SAM BATTERY (TEL&#xD7;4)</h3>
        <div id="hud-tel" style="font-size:8px;line-height:1.6;color:rgba(0,255,136,0.6)"></div>
        <div class="row" style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,255,136,0.12)"><span class="lbl">동시교전</span><span class="bl" id="hud-engage">0 / 10</span></div>
        <div class="row"><span class="lbl">격추/관통</span>
          <span><span class="gn" id="hud-hit">0</span><span style="color:rgba(255,255,255,0.25)"> / </span><span class="rd" id="hud-leak">0</span></span>
        </div>
      </div>
      <div class="hbox">
        <h3>&#x25B8; EVENT LOG</h3>
        <div id="hud-log" style="font-size:8px;color:rgba(0,255,136,0.45);max-height:100px;overflow-y:auto;line-height:1.55"></div>
      </div>
    `;
  }

  /**
   * 시뮬레이션 상태 업데이트
   * @param {string} status
   * @param {number} simTime
   * @param {string} architecture
   */
  updateStatus(status, simTime, architecture) {
    const el = (id) => document.getElementById(id);
    const statusEl = el('hud-status');
    const timeEl = el('hud-time');
    const archEl = el('hud-arch');
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = status === 'RUNNING' ? 'gn' : status === 'COMPLETE' ? 'bl' : 'yl';
    }
    if (timeEl) timeEl.textContent = simTime.toFixed(1) + 's';
    if (archEl) archEl.textContent = architecture === 'killweb' ? 'KILL WEB' : 'LINEAR C2';
  }

  /**
   * 위협 수 업데이트
   * @param {number} active
   * @param {number} total
   */
  updateThreats(active, total) {
    const el = document.getElementById('hud-threats');
    if (el) el.textContent = `${active} / ${total}`;
  }

  /**
   * 포대 상태 업데이트
   * @param {{ abm: number, aam: number, active: number, max: number, hits: number, leaks: number }} data
   */
  updateBattery(data) {
    const el = (id) => document.getElementById(id);
    const engEl = el('hud-engage');
    const hitEl = el('hud-hit');
    const leakEl = el('hud-leak');
    const telEl = el('hud-tel');

    // TEL별 탄약 표시
    if (telEl && data.launchers) {
      telEl.innerHTML = data.launchers.map(l => {
        const pips = Array(l.capacity).fill(0).map((_, i) =>
          `<span style="display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:1px;background:${i < l.remaining ? '#00ff88' : 'rgba(0,255,136,0.1)'};border:1px solid rgba(0,255,136,0.2)"></span>`
        ).join('');
        const color = l.remaining === 0 ? '#ff4444' : l.remaining <= 2 ? '#ffcc00' : '#00ff88';
        return `<div style="margin-bottom:2px"><span style="color:rgba(0,255,136,0.5);width:50px;display:inline-block">${l.missileType}-${l.id.slice(-1)}</span>${pips} <span style="color:${color}">${l.remaining}/${l.capacity}</span></div>`;
      }).join('');
    }

    if (engEl) engEl.textContent = `${data.active} / ${data.max}`;
    if (hitEl) hitEl.textContent = data.hits;
    if (leakEl) leakEl.textContent = data.leaks;
  }

  /**
   * 킬체인 상태 표시
   * @param {string} threatId
   * @param {string} stage
   */
  updateKillchain(threatId, stage) {
    const el = document.getElementById('hud-killchain');
    if (!el) return;

    const stageNames = {
      'GP_DETECTED': '&#x25B6; GREEN_PINE 탐지',
      'KAMD_PROCESSING': '&#x25B6; KAMD 분석 중...',
      'KAMD_DONE': '&#x2713; KAMD 승인',
      'ICC_PROCESSING': '&#x25B6; ICC 처리 중...',
      'ICC_DONE': '&#x2713; ICC 승인',
      'ECS_PROCESSING': '&#x25B6; ECS 처리 중...',
      'ECS_DONE': '&#x2713; ECS 발사 승인',
      'ENGAGEMENT_READY': '&#x2713; 교전 준비 완료',
    };

    el.innerHTML = stageNames[stage] || stage;
  }

  /**
   * 이벤트 로그 추가
   * @param {string} msg
   * @param {string} [color='#00ff88']
   */
  addLog(msg, color = '#00ff88') {
    this.logEntries.unshift({ msg, color, time: new Date().toISOString().substr(11, 8) });
    if (this.logEntries.length > MAX_LOG_ENTRIES) this.logEntries.pop();

    const el = document.getElementById('hud-log');
    if (!el) return;

    el.innerHTML = this.logEntries.map(e =>
      `<div style="color:${e.color};margin-bottom:1px">[${e.time}] ${e.msg}</div>`
    ).join('');
  }
}
