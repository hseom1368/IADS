/**
 * viz/threat-tracking-panel.js — 상시 위협 추적 패널
 *
 * 구조:
 *  - 상단: ACTIVE / TERMINATED 목록 (체크박스로 다중 선택)
 *  - 하단: 선택된 위협의 시계열 그래프 (canvas 2D, 의존성 없음)
 *    - 메트릭 토글: ALT(고도 km) / SPD(Mach) / RNG(잔여거리 km)
 *    - 다중 위협 중첩 표시, 위협별 색상 구분
 *
 * 데이터 소스:
 *  - 라이브 값: engine.threats[i].telemetry의 마지막 샘플 (or currentSpeed)
 *  - 그래프 시리즈: core/telemetry.js의 toTimeSeries / timeAltitudeSeries / ...
 *
 * 이벤트 연결 (index.html에서 호출):
 *  - onThreatSpawned(threat)
 *  - onThreatTerminated(threatId, result)  // 'intercepted' | 'leaked' | 'destroyed'
 *  - updateLive(engine)  // 매 프레임
 *  - reset()
 */

import {
  timeAltitudeSeries,
  timeSpeedSeries,
  timeRangeSeries,
  getLatestSample,
} from '../core/telemetry.js';

const PANEL_ID = 'threatTrackingPanel';
const CSS_ID = 'threatTrackingPanelCss';

// 위협별 색상 팔레트 (HUD 톤과 조화)
const THREAT_PALETTE = [
  '#ff4444', '#ffaa00', '#44aaff', '#ff88ff', '#88ff88', '#ffff44', '#ff8844', '#44ffff',
];

/** @type {Object.<string,{ label:string, unit:string, series:Function }>} */
const METRICS = {
  alt: { label: 'ALTITUDE',      unit: 'km',   series: timeAltitudeSeries },
  spd: { label: 'SPEED',         unit: 'Mach', series: timeSpeedSeries },
  rng: { label: 'RANGE TO TGT',  unit: 'km',   series: timeRangeSeries },
};

function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = `
    #${PANEL_ID} {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 280px;
      max-height: calc(100vh - 24px);
      display: flex;
      flex-direction: column;
      background: rgba(0,4,2,0.93);
      border: 1px solid rgba(0,255,136,0.32);
      color: #ff8888;
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      z-index: 120;
      box-shadow: 0 0 12px rgba(0,255,136,0.08);
    }
    #${PANEL_ID} .tt-head {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(0,255,136,0.18);
    }
    #${PANEL_ID} .tt-head h3 {
      font-family: 'Orbitron', sans-serif;
      font-size: 8px;
      letter-spacing: 3px;
      color: #00ff88;
    }
    #${PANEL_ID} .tt-section {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(0,255,136,0.12);
    }
    #${PANEL_ID} .tt-section:last-child { border-bottom: none; }
    #${PANEL_ID} .tt-secHead {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Orbitron', sans-serif;
      font-size: 7px;
      letter-spacing: 2px;
      color: rgba(0,255,136,0.7);
      margin-bottom: 6px;
    }
    #${PANEL_ID} .tt-count { color: rgba(0,255,136,0.4); }
    #${PANEL_ID} .tt-list {
      max-height: 130px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    #${PANEL_ID} .tt-row {
      display: grid;
      grid-template-columns: 14px 48px 32px 42px 50px auto;
      gap: 4px;
      align-items: center;
      padding: 3px 4px;
      background: rgba(255,68,68,0.04);
      border: 1px solid rgba(255,68,68,0.15);
      cursor: pointer;
      font-size: 9px;
    }
    #${PANEL_ID} .tt-row.term { background: rgba(68,68,68,0.1); border-color: rgba(100,100,100,0.2); color: rgba(200,200,200,0.6); }
    #${PANEL_ID} .tt-row.hit  { background: rgba(0,255,136,0.06); border-color: rgba(0,255,136,0.25); }
    #${PANEL_ID} .tt-row.leak { background: rgba(255,0,0,0.10); border-color: rgba(255,0,0,0.35); }
    #${PANEL_ID} .tt-row:hover { background: rgba(255,68,68,0.12); }
    #${PANEL_ID} .tt-row input[type=checkbox] {
      width: 11px; height: 11px;
      margin: 0;
      accent-color: #00ff88;
      cursor: pointer;
    }
    #${PANEL_ID} .tt-id    { color: #ffbbbb; font-weight: bold; }
    #${PANEL_ID} .tt-state { color: rgba(255,204,0,0.9); font-size: 7px; letter-spacing: 0.5px; }
    #${PANEL_ID} .tt-state.hit  { color: #00ff88; }
    #${PANEL_ID} .tt-state.leak { color: #ff0000; }
    #${PANEL_ID} .tt-state.term { color: rgba(150,150,150,0.8); }
    #${PANEL_ID} .tt-val   { color: #ffbbbb; text-align: right; }
    #${PANEL_ID} .tt-dot   { width: 8px; height: 8px; border-radius: 50%; justify-self: center; }
    #${PANEL_ID} .tt-empty {
      color: rgba(255,136,136,0.35);
      font-style: italic;
      text-align: center;
      padding: 6px 0;
    }
    #${PANEL_ID} .tt-metric-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 6px;
    }
    #${PANEL_ID} .tt-tab {
      flex: 1;
      background: rgba(0,4,2,0.6);
      border: 1px solid rgba(0,255,136,0.25);
      color: rgba(0,255,136,0.55);
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      letter-spacing: 1px;
      padding: 3px 0;
      cursor: pointer;
      transition: all 0.15s;
    }
    #${PANEL_ID} .tt-tab:hover { background: rgba(0,255,136,0.08); }
    #${PANEL_ID} .tt-tab.active {
      background: rgba(0,255,136,0.18);
      color: #00ff88;
      box-shadow: 0 0 5px rgba(0,255,136,0.15);
    }
    #${PANEL_ID} .tt-canvas-wrap {
      position: relative;
      width: 100%;
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(0,255,136,0.18);
    }
    #${PANEL_ID} canvas {
      display: block;
      width: 100%;
      height: 140px;
    }
    #${PANEL_ID} .tt-legend {
      margin-top: 5px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 8px;
      color: rgba(0,255,136,0.7);
    }
    #${PANEL_ID} .tt-legend-item {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    #${PANEL_ID} .tt-legend-sw { width: 10px; height: 2px; }
    #${PANEL_ID} .tt-list::-webkit-scrollbar { width: 4px; }
    #${PANEL_ID} .tt-list::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
    #${PANEL_ID} .tt-list::-webkit-scrollbar-thumb { background: rgba(0,255,136,0.3); }
  `;
  document.head.appendChild(style);
}

export class ThreatTrackingPanel {
  constructor() {
    injectCss();

    /** 등록된 위협 목록 (ACTIVE/TERMINATED 모두 포함)
     *  @type {Array<{ id:string, typeId:string, name:string, color:string, status:'active'|'hit'|'leak'|'term', addedAt:number }>} */
    this.entries = [];
    /** 색상 팔레트 인덱스 */
    this.colorIdx = 0;
    /** 선택된 위협 ID 집합 */
    this.selected = new Set();
    /** 현재 메트릭: 'alt' | 'spd' | 'rng' */
    this.metric = 'alt';
    /** sim engine 참조 (updateLive에서 설정) */
    this.engineRef = null;

    this._buildDom();
    this._bindEvents();
  }

  _buildDom() {
    this.el = document.createElement('div');
    this.el.id = PANEL_ID;
    this.el.innerHTML = `
      <div class="tt-head"><h3>&#x25B8; THREAT TRACKING</h3></div>
      <div class="tt-section">
        <div class="tt-secHead"><span>ACTIVE</span><span class="tt-count" data-count="active">0</span></div>
        <div class="tt-list" data-list="active"></div>
      </div>
      <div class="tt-section">
        <div class="tt-secHead"><span>TERMINATED</span><span class="tt-count" data-count="term">0</span></div>
        <div class="tt-list" data-list="term"></div>
      </div>
      <div class="tt-section">
        <div class="tt-secHead"><span>ANALYSIS</span><span class="tt-count" id="tt-selected-count">0 selected</span></div>
        <div class="tt-metric-tabs">
          <button class="tt-tab active" data-metric="alt">ALT (km)</button>
          <button class="tt-tab" data-metric="spd">SPD (M)</button>
          <button class="tt-tab" data-metric="rng">RNG (km)</button>
        </div>
        <div class="tt-canvas-wrap">
          <canvas id="tt-chart" width="260" height="140"></canvas>
        </div>
        <div class="tt-legend" data-legend></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.activeListEl = this.el.querySelector('[data-list="active"]');
    this.termListEl = this.el.querySelector('[data-list="term"]');
    this.activeCountEl = this.el.querySelector('[data-count="active"]');
    this.termCountEl = this.el.querySelector('[data-count="term"]');
    this.selCountEl = this.el.querySelector('#tt-selected-count');
    this.legendEl = this.el.querySelector('[data-legend]');
    this.canvas = this.el.querySelector('#tt-chart');
    this.ctx = this.canvas.getContext('2d');

    // 초기 빈 상태
    this._renderEmpty();
  }

  _bindEvents() {
    // 메트릭 탭
    this.el.querySelectorAll('.tt-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.metric = btn.dataset.metric;
        this.el.querySelectorAll('.tt-tab').forEach(b => b.classList.toggle('active', b === btn));
        this._renderChart();
      });
    });
  }

  _renderEmpty() {
    if (this.entries.length === 0) {
      this.activeListEl.innerHTML = '<div class="tt-empty">No active threats.</div>';
      this.termListEl.innerHTML = '<div class="tt-empty">—</div>';
    }
  }

  _nextColor() {
    const c = THREAT_PALETTE[this.colorIdx % THREAT_PALETTE.length];
    this.colorIdx++;
    return c;
  }

  // ── 외부 이벤트 훅 ──────────────────────────────────────────

  /**
   * 위협 스폰 시 호출
   * @param {import('../core/entities.js').ThreatEntity} threat
   * @param {string} name - 표시 이름 (예: 'BM-001')
   */
  onThreatSpawned(threat, name) {
    if (this.entries.find(e => e.id === threat.id)) return;
    const entry = {
      id: threat.id,
      typeId: threat.typeId,
      name,
      color: this._nextColor(),
      status: 'active',
      addedAt: Date.now(),
    };
    this.entries.push(entry);
    // 기본 선택: 처음 5개까지 자동 선택
    if (this.selected.size < 5) this.selected.add(threat.id);
    this._renderList();
    this._renderChart();
  }

  /**
   * 위협 종료 시 호출
   * @param {string} threatId
   * @param {'hit'|'leak'|'term'} result
   */
  onThreatTerminated(threatId, result) {
    const e = this.entries.find(x => x.id === threatId);
    if (!e) return;
    e.status = result;
    this._renderList();
  }

  /**
   * 프레임 루프에서 호출 — 라이브 값 + 그래프 주기적 갱신
   * @param {import('../core/sim-engine.js').SimEngine} engine
   */
  updateLive(engine) {
    this.engineRef = engine;
    this._renderList(); // 라이브 값은 매 프레임 갱신
    // 그래프는 너무 자주 그릴 필요 없음 (텔레메트리 샘플 간격=0.5s)
    if (!this._lastChartT || engine.simTime - this._lastChartT >= 0.25) {
      this._renderChart();
      this._lastChartT = engine.simTime;
    }
  }

  /** 리셋 */
  reset() {
    this.entries = [];
    this.selected.clear();
    this.colorIdx = 0;
    this._lastChartT = 0;
    this._renderList();
    this._renderChart();
  }

  // ── 렌더링 ─────────────────────────────────────────────────

  _renderList() {
    const active = this.entries.filter(e => e.status === 'active');
    const terminated = this.entries.filter(e => e.status !== 'active');

    this.activeCountEl.textContent = String(active.length);
    this.termCountEl.textContent = String(terminated.length);
    this.selCountEl.textContent = `${this.selected.size} selected`;

    if (active.length === 0) {
      this.activeListEl.innerHTML = '<div class="tt-empty">No active threats.</div>';
    } else {
      this.activeListEl.innerHTML = '';
      for (const e of active) this.activeListEl.appendChild(this._buildRow(e));
    }

    if (terminated.length === 0) {
      this.termListEl.innerHTML = '<div class="tt-empty">—</div>';
    } else {
      this.termListEl.innerHTML = '';
      for (const e of terminated) this.termListEl.appendChild(this._buildRow(e));
    }
  }

  _buildRow(entry) {
    const row = document.createElement('div');
    const statusCls = entry.status === 'active' ? '' :
      entry.status === 'hit' ? 'term hit' :
      entry.status === 'leak' ? 'term leak' : 'term';
    row.className = `tt-row ${statusCls}`;

    const threat = this.engineRef?.threats.find(t => t.id === entry.id);
    const latest = threat ? getLatestSample(threat) : null;
    const altTxt = latest ? `${latest.altKm.toFixed(0)}km` : '—';
    const machTxt = latest ? `M${latest.mach.toFixed(1)}` : '—';
    const stateLabel = {
      active: (threat?.state || 'flying').toUpperCase().slice(0, 4),
      hit: 'HIT',
      leak: 'LEAK',
      term: 'END',
    }[entry.status];
    const stateCls = entry.status === 'hit' ? 'hit' : entry.status === 'leak' ? 'leak' : entry.status === 'term' ? 'term' : '';

    const checked = this.selected.has(entry.id) ? 'checked' : '';
    row.innerHTML = `
      <input type="checkbox" ${checked}>
      <span class="tt-id">${entry.name}</span>
      <span class="tt-state ${stateCls}">${stateLabel}</span>
      <span class="tt-val">${altTxt}</span>
      <span class="tt-val">${machTxt}</span>
      <span class="tt-dot" style="background:${entry.color}"></span>
    `;

    const cb = row.querySelector('input[type=checkbox]');
    cb.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (cb.checked) this.selected.add(entry.id);
      else this.selected.delete(entry.id);
      this.selCountEl.textContent = `${this.selected.size} selected`;
      this._renderChart();
    });
    row.addEventListener('click', (ev) => {
      if (ev.target === cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('click', { bubbles: true }));
    });
    return row;
  }

  // ── 그래프 렌더링 (Canvas 2D) ──────────────────────────────

  _renderChart() {
    const ctx = this.ctx;
    // 실제 캔버스 폭을 화면 폭에 맞춰 재설정 (DPR 고려)
    const cssW = this.canvas.clientWidth || 260;
    const cssH = 140;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== cssW * dpr || this.canvas.height !== cssH * dpr) {
      this.canvas.width = cssW * dpr;
      this.canvas.height = cssH * dpr;
    }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // 배경 그리드
    const padL = 30, padR = 8, padT = 8, padB = 18;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    ctx.strokeStyle = 'rgba(0,255,136,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = padL + (plotW * i) / 4;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }

    // 축
    ctx.strokeStyle = 'rgba(0,255,136,0.4)';
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // 선택된 위협 시리즈 수집
    const metricCfg = METRICS[this.metric];
    const seriesList = [];
    if (this.engineRef) {
      for (const entry of this.entries) {
        if (!this.selected.has(entry.id)) continue;
        const threat = this.engineRef.threats.find(t => t.id === entry.id);
        if (!threat || threat.telemetry.length === 0) continue;
        const s = metricCfg.series(threat);
        seriesList.push({ entry, ...s });
      }
    }

    // 데이터가 없으면 안내 텍스트
    if (seriesList.length === 0) {
      ctx.fillStyle = 'rgba(0,255,136,0.35)';
      ctx.font = "9px 'Share Tech Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('SELECT THREATS TO VIEW GRAPH', padL + plotW / 2, padT + plotH / 2);
      // Y축 레이블
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,255,136,0.5)';
      ctx.fillText(metricCfg.label + ' (' + metricCfg.unit + ')', padL, padT - 1);
      this._renderLegend([]);
      ctx.restore();
      return;
    }

    // 데이터 범위 계산
    let tMin = Infinity, tMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of seriesList) {
      for (let i = 0; i < s.t.length; i++) {
        if (s.t[i] < tMin) tMin = s.t[i];
        if (s.t[i] > tMax) tMax = s.t[i];
        if (s.y[i] < yMin) yMin = s.y[i];
        if (s.y[i] > yMax) yMax = s.y[i];
      }
    }
    if (tMax <= tMin) tMax = tMin + 1;
    if (yMax <= yMin) { yMax = yMin + 1; }
    // Y축 여유
    const yPad = (yMax - yMin) * 0.1;
    yMin = Math.max(0, yMin - yPad);
    yMax = yMax + yPad;

    const xScale = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
    const yScale = (y) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // 각 시리즈 선 그리기
    for (const s of seriesList) {
      ctx.strokeStyle = s.entry.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < s.t.length; i++) {
        const x = xScale(s.t[i]);
        const y = yScale(s.y[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 축 레이블 (Y: min/max, X: min/max 시간)
    ctx.fillStyle = 'rgba(0,255,136,0.65)';
    ctx.font = "8px 'Share Tech Mono', monospace";
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(yMax.toFixed(1), padL - 3, padT);
    ctx.fillText(yMin.toFixed(1), padL - 3, padT + plotH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`t=${tMin.toFixed(0)}s`, padL, padT + plotH + 2);
    ctx.fillText(`${tMax.toFixed(0)}s`, padL + plotW, padT + plotH + 2);

    // Y축 타이틀
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,255,136,0.5)';
    ctx.fillText(metricCfg.label + ' (' + metricCfg.unit + ')', padL, padT - 1);

    ctx.restore();
    this._renderLegend(seriesList);
  }

  _renderLegend(seriesList) {
    if (seriesList.length === 0) {
      this.legendEl.innerHTML = '';
      return;
    }
    this.legendEl.innerHTML = seriesList.map(s => `
      <div class="tt-legend-item">
        <div class="tt-legend-sw" style="background:${s.entry.color}"></div>
        <span>${s.entry.name}</span>
      </div>
    `).join('');
  }
}
