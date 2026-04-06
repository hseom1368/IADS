/**
 * @module main
 * KIDA ADSIM v2.0 통합 오케스트레이터
 * Phase 1.4: 선형 C2 탄도탄 대응 3D 시각화
 * GREEN_PINE 탐지 → KAMD→ICC→ECS 킬체인 → L-SAM 요격 전체 과정 시각화
 */

// ── core 모듈 ──
import { Registry } from './core/registry.js';
import { SimEngine } from './core/sim-engine.js';
import {
  SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES
} from './config/weapon-data.js';

// ── viz 모듈 ──
import { initViewer, requestRender } from './viz/cesium-app.js';
import { createRadarVolume } from './viz/radar-viz.js';
import { initEngagementViz, updateThreats, updateInterceptors, triggerExplosion, clearAll } from './viz/engagement-viz.js';
import { initHud, updateHud, updateKillchainHudForThreat, addLogEntry } from './viz/hud.js';
import { initNetworkViz, updateNetworkFromKillchain, deactivateAllLinks, destroyNetworkViz } from './viz/network-viz.js';
import { initInteraction, destroyInteraction } from './viz/interaction.js';

// ═══════════════════════════════════════════════════════════
//  시나리오 데이터 — Phase 1.4 선형 C2 탄도탄 대응
// ═══════════════════════════════════════════════════════════

const SCENARIO = {
  sensors: [
    { id: 'gp1',  typeId: 'GREEN_PINE', position: { lon: 127.0, lat: 36.5, alt: 200 },  azCenter: 0 },
    { id: 'mfr1', typeId: 'MSAM_MFR',   position: { lon: 127.0, lat: 37.74, alt: 100 }, azCenter: 0 }
  ],
  c2s: [
    { id: 'kamd1', typeId: 'KAMD_OPS', position: { lon: 127.0, lat: 37.0, alt: 50 } },
    { id: 'icc1',  typeId: 'ICC',      position: { lon: 127.0, lat: 37.4, alt: 50 } },
    { id: 'ecs1',  typeId: 'ECS',      position: { lon: 127.0, lat: 37.65, alt: 50 } }
  ],
  shooter: { id: 'shooter1', typeId: 'LSAM_ABM', position: { lon: 127.0, lat: 37.74, alt: 100 } },
  threat: {
    typeId: 'SRBM',
    origin: { lon: 127.0, lat: 40.0, alt: 200 },
    target: { lon: 127.0, lat: 37.0, alt: 0 }
  },
  // 선형 C2 킬체인 데이터링크 경로
  datalinks: [
    { from: 'gp1',   to: 'kamd1' },
    { from: 'kamd1', to: 'icc1' },
    { from: 'icc1',  to: 'ecs1' }
  ]
};

let threatCounter = 0;

// ═══════════════════════════════════════════════════════════
//  전역 상태
// ═══════════════════════════════════════════════════════════

/** @type {SimEngine} */
let engine = null;
/** @type {Cesium.Viewer} */
let viewer = null;
/** @type {Map<string, {entities: any[], destroy: Function}>} */
const radarVolumes = new Map();
/** @type {string|null} 현재 추적 중인 위협 ID (킬체인 HUD용) */
let activeTrackingThreatId = null;

// ═══════════════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════════════

function init() {
  // 1. Cesium Viewer
  viewer = initViewer('cesiumContainer');

  // 2. Registry + SimEngine
  const registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  engine = new SimEngine(registry);

  // 3. 엔티티 배치 (센서 + C2 + 사수)
  _deployEntities();

  // 4. viz 초기화
  initEngagementViz(viewer);
  _createRadarVolumes();
  _initNetworkViz();
  initInteraction(viewer, radarVolumes);
  initHud(engine);

  // 5. 이벤트 구독
  _subscribeEvents();

  // 6. 버튼 바인딩
  _bindControls();

  // 7. 렌더링 루프
  _startRenderLoop();

  addLogEntry('시스템 초기화 완료', '#00ff88');
}

// ═══════════════════════════════════════════════════════════
//  엔티티 배치
// ═══════════════════════════════════════════════════════════

function _deployEntities() {
  for (const sensor of SCENARIO.sensors) {
    engine.addSensor(sensor.id, sensor.typeId, sensor.position, sensor.azCenter);
  }
  for (const c2 of SCENARIO.c2s) {
    engine.addC2(c2.id, c2.typeId, c2.position);
  }
  engine.addShooter(SCENARIO.shooter.id, SCENARIO.shooter.typeId, SCENARIO.shooter.position);
}

// ═══════════════════════════════════════════════════════════
//  레이더 볼륨 생성
// ═══════════════════════════════════════════════════════════

function _createRadarVolumes() {
  for (const vol of radarVolumes.values()) vol.destroy();
  radarVolumes.clear();

  for (const sensor of SCENARIO.sensors) {
    const sensorCap = engine._registry.getSensorCapability(sensor.typeId);
    if (!sensorCap) continue;

    const volume = createRadarVolume(viewer, sensor.position, {
      azCenter: sensor.azCenter,
      azHalf: sensorCap.fov.azHalf,
      elMax: sensorCap.fov.elMax,
      detectionRange: sensorCap.maxRange * 1000
    });
    radarVolumes.set(sensor.id, volume);
  }
}

// ═══════════════════════════════════════════════════════════
//  네트워크 시각화 초기화
// ═══════════════════════════════════════════════════════════

function _initNetworkViz() {
  const networkNodes = [
    ...SCENARIO.sensors.map(s => ({ ...s, role: 'sensor' })),
    ...SCENARIO.c2s.map(c => ({ ...c, role: 'c2' })),
    { ...SCENARIO.shooter, role: 'shooter' }
  ];
  initNetworkViz(viewer, networkNodes, SCENARIO.datalinks);
}

// ═══════════════════════════════════════════════════════════
//  이벤트 구독
// ═══════════════════════════════════════════════════════════

function _subscribeEvents() {
  engine.on('threat-detected', (d) => {
    if (!activeTrackingThreatId) {
      activeTrackingThreatId = d.threatId;
    }
    const alertEl = document.getElementById('alert');
    if (alertEl) {
      alertEl.style.display = 'block';
      setTimeout(() => { alertEl.style.display = 'none'; }, 5000);
    }
  });

  engine.on('intercept-hit', (d) => {
    const threat = engine._threats.get(d.threatId);
    if (threat) triggerExplosion(viewer, threat.position, true);
    if (d.threatId === activeTrackingThreatId) activeTrackingThreatId = null;
  });

  engine.on('intercept-miss', (d) => {
    const threat = engine._threats.get(d.threatId);
    if (threat) triggerExplosion(viewer, threat.position, false);
  });

  engine.on('threat-leaked', (d) => {
    triggerExplosion(viewer, d.position, false);
    if (d.threatId === activeTrackingThreatId) activeTrackingThreatId = null;
  });
}

// ═══════════════════════════════════════════════════════════
//  버튼 바인딩
// ═══════════════════════════════════════════════════════════

function _bindControls() {
  const btnFire = document.getElementById('btnFireThreat');
  if (btnFire) {
    btnFire.addEventListener('click', () => {
      threatCounter++;
      const id = `SRBM_${String(threatCounter).padStart(3, '0')}`;
      engine.addThreat(id, SCENARIO.threat.typeId, SCENARIO.threat.origin, SCENARIO.threat.target, engine.simTime);
      if (engine.state === 'READY') engine.play();
      addLogEntry(`위협 발사: ${id}`, '#ff4444');
    });
  }

  const btnReset = document.getElementById('btnReset');
  if (btnReset) {
    btnReset.addEventListener('click', _resetSimulation);
  }

  const spdSlider = document.getElementById('spdSlider');
  const spdLbl = document.getElementById('spdLbl');
  if (spdSlider) {
    spdSlider.addEventListener('input', () => {
      const scale = parseInt(spdSlider.value);
      engine.timeScale = scale;
      if (spdLbl) spdLbl.textContent = `${scale}x`;
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  리셋
// ═══════════════════════════════════════════════════════════

function _resetSimulation() {
  engine.reset();
  clearAll();
  deactivateAllLinks();
  destroyNetworkViz();
  destroyInteraction();
  threatCounter = 0;
  activeTrackingThreatId = null;

  const registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  engine = new SimEngine(registry);
  _deployEntities();
  _createRadarVolumes();
  _initNetworkViz();
  initInteraction(viewer, radarVolumes);
  initHud(engine);
  _subscribeEvents();

  addLogEntry('시스템 초기화 완료', '#00ff88');
}

// ═══════════════════════════════════════════════════════════
//  렌더링 루프
// ═══════════════════════════════════════════════════════════

let _lastTimestamp = 0;

function _startRenderLoop() {
  _lastTimestamp = performance.now();

  function loop(timestamp) {
    const dtReal = Math.min((timestamp - _lastTimestamp) / 1000, 0.05);
    _lastTimestamp = timestamp;

    engine.step(dtReal);

    // viz 업데이트
    updateThreats(engine.getAllThreats());
    updateInterceptors(engine.getAllInterceptors());
    updateHud(engine);

    // 킬체인 HUD + 네트워크 viz
    const killchain = engine.getKillchain();
    if (activeTrackingThreatId) {
      updateKillchainHudForThreat(killchain, activeTrackingThreatId, engine.simTime);
      updateNetworkFromKillchain(killchain, activeTrackingThreatId);
    }

    requestRender();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════
//  시작
// ═══════════════════════════════════════════════════════════
init();
