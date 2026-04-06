/**
 * @module viz/network-viz
 * C2 네트워크 시각화 — 노드 배치 + 데이터링크 애니메이션
 * Cesium Entity API (정적 C2 노드) + PolylineCollection (데이터링크)
 *
 * Phase 1.4에서 구현 예정
 *
 * === 주요 기능 ===
 * 1. C2 노드 배치: KAMD_OPS, ICC, ECS를 지도 위 아이콘으로 표시
 *    - Entity API + EntityCluster 허용 (정적 오브젝트)
 *    - distanceDisplayCondition 필수
 *
 * 2. 데이터링크 시각화:
 *    - GREEN_PINE → KAMD_OPS → ICC → ECS 연결선
 *    - 킬체인 진행 시 해당 구간 활성화 (cyan 애니메이션)
 *    - 비활성 구간: 어두운 회색
 *    - PolylineCollection 사용 (allowPicking: false)
 *
 * === Export 예정 ===
 * initNetworkViz(viewer, entities)
 * activateLink(fromId, toId)
 * deactivateAllLinks()
 * updateC2NodeStatus(c2Id, status)
 */
