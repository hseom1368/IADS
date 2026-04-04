/**
 * @module main
 * KIDA ADSIM v2.0 통합 오케스트레이터
 * Phase 1 MVP: L-SAM 1세트 + SRBM 1발 요격 시나리오
 */

// ── core 모듈 ──
import { Registry } from './core/registry.js';
import { SimEngine } from './core/sim-engine.js';
import {
  SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES
} from './config/weapon-data.js';

// ── viz 모듈 ──
import { initViewer, getViewer, requestRender } from './viz/cesium-app.js';
import { createRadarVolume } from './viz/radar-viz.js';
import { initEngagementViz, updateThreats, updateInterceptors, triggerExplosion, clearAll } from './viz/engagement-viz.js';
import { initHud, updateHud, addLogEntry } from './viz/hud.js';

// ═══════════════════════════════════════════════════════════
//  MVP 시나리오 데이터
// ═══════════════════════════════════════════════════════════

const SCENARIO = {
  sensor: { id: 'sensor1', typeId: 'MSAM_MFR', position: { lon: 127.0, lat: 37.74, alt: 100 }, azCenter: 0 },
  shooter: { id: 'shooter1', typeId: 'LSAM_ABM', position: { lon: 127.0, lat: 37.74, alt: 100 } },
  threat: {
    typeId: 'SRBM',
    origin: { lon: 127.0, lat: 39.0, alt: 200 },
    target: { lon: 127.0, lat: 37.5, alt: 0 }
  }
};

let threatCounter = 0;

// ═══════════════════════════════════════════════════════════
//  전역 상태
// ═══════════════════════════════════════════════════════════

/** @type {SimEngine} */
let engine = null;
/** @type {Cesium.Viewer} */
let viewer = null;
/** @type {{ entities: any[], destroy: Function }|null} */
let radarVolume = null;

// ═══════════════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════════════

function init() {
  // 1. Cesium Viewer
  viewer = initViewer('cesiumContainer');

  // 2. Registry + SimEngine
  const registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  engine = new SimEngine(registry);

  // 3. 정적 엔티티 배치
  _deployStaticEntities();

  // 4. viz 초기화
  initEngagementViz(viewer);
  _createRadar();
  initHud(engine);

  // 5. 폭발 이벤트 구독
  _subscribeExplosions();

  // 6. 버튼 바인딩
  _bindControls();

  // 7. 렌더링 루프
  _startRenderLoop();

  addLogEntry('시스템 초기화 완료', '#00ff88');
}

// ═══════════════════════════════════════════════════════════
//  엔티티 배치
// ═══════════════════════════════════════════════════════════

function _deployStaticEntities() {
  const s = SCENARIO;
  engine.addSensor(s.sensor.id, s.sensor.typeId, s.sensor.position, s.sensor.azCenter);
  engine.addShooter(s.shooter.id, s.shooter.typeId, s.shooter.position);
}

function _createRadar() {
  if (radarVolume) radarVolume.destroy();
  const sensorCap = engine._registry.getSensorCapability(SCENARIO.sensor.typeId);
  radarVolume = createRadarVolume(viewer, SCENARIO.sensor.position, {
    azCenter: SCENARIO.sensor.azCenter,
    azHalf: sensorCap.fov.azHalf,
    elMax: sensorCap.fov.elMax,
    detectionRange: sensorCap.maxRange * 1000 // km → m
  });
}

// ═══════════════════════════════════════════════════════════
//  이벤트 구독
// ═══════════════════════════════════════════════════════════

function _subscribeExplosions() {
  engine.on('intercept-hit', (d) => {
    const threat = engine._threats.get(d.threatId);
    if (threat) {
      triggerExplosion(viewer, threat.position, true);
    }
  });

  engine.on('intercept-miss', (d) => {
    const threat = engine._threats.get(d.threatId);
    if (threat) {
      triggerExplosion(viewer, threat.position, false);
    }
  });

  engine.on('threat-leaked', (d) => {
    triggerExplosion(viewer, d.position, false);
  });
}

// ═══════════════════════════════════════════════════════════
//  버튼 바인딩
// ═══════════════════════════════════════════════════════════

function _bindControls() {
  // 위협 발사
  const btnFire = document.getElementById('btnFireThreat');
  if (btnFire) {
    btnFire.addEventListener('click', () => {
      threatCounter++;
      const id = `SRBM_${String(threatCounter).padStart(3, '0')}`;
      engine.addThreat(
        id,
        SCENARIO.threat.typeId,
        SCENARIO.threat.origin,
        SCENARIO.threat.target,
        engine.simTime
      );
      if (engine.state === 'READY') {
        engine.play();
      }
      addLogEntry(`위협 발사: ${id}`, '#ff4444');
    });
  }

  // 초기화
  const btnReset = document.getElementById('btnReset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      engine.reset();
      clearAll();
      threatCounter = 0;

      // Registry + SimEngine 재생성
      const registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
      engine = new SimEngine(registry);
      _deployStaticEntities();
      _createRadar();
      initHud(engine);
      _subscribeExplosions();

      addLogEntry('시스템 초기화 완료', '#00ff88');
    });
  }

  // 재생속도
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
//  렌더링 루프
// ═══════════════════════════════════════════════════════════

let _lastTimestamp = 0;

function _startRenderLoop() {
  _lastTimestamp = performance.now();

  function loop(timestamp) {
    const dtReal = Math.min((timestamp - _lastTimestamp) / 1000, 0.05);
    _lastTimestamp = timestamp;

    // SimEngine step
    engine.step(dtReal);

    // viz 업데이트
    updateThreats(engine.getAllThreats());
    updateInterceptors(engine.getAllInterceptors());
    updateHud(engine);
    requestRender();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════
//  시작
// ═══════════════════════════════════════════════════════════
init();
