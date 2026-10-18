# Phase B1 validation · 2026-10-18

B1은 시뮬레이션 기반 단계입니다. 유권자 모델·Potential/Current·여론조사·정당 AI·선거 결과/밸런스는 아직 검증 대상이 아닙니다.

## 로컬 결과

- `npm ci`: 통과. Node 22 이상을 사용합니다.
- `npm run typecheck`, `npm run lint`: 통과. 엔진은 기존 ES2022 전용 설정에서도 DOM/React 없이 검사합니다.
- `npm test`: **4개 파일, 40개 테스트 통과**.
- `npm run validate:data`: 통과, **55개 미검증 레코드 경고**.
- `npm run validate:data -- --release`: **exit 1, 기대된 차단**. 오류는 모두 `UNVERIFIED_ASSUMPTION`입니다.
- `npm run sim -- --seeds 20`: 20시드 × 77번 전진, 정확히 96개 코호트와 18번 월간 갱신, 이슈/driver 범위, 세이브/재생 해시 일치. 배치 해시 `2966620a1f85ce19`.
- `npm run build`: 통과, UI와 별도 Worker 번들 생성.
- `npm run build:release`: **미검증 데이터 검사에서 차단**. 공개 배포 완료가 아닙니다.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: **3개 Chromium 시나리오 통과**.

Playwright는 실제 Worker/메인 스레드 동일 해시, 자동저장 새로고침, 수동 저장과 JSON 왕복, Phase A JSON 거부 후 현재 상태 유지, HashRouter 하위 경로 새로고침, 15주/여러 월 진행과 게임 모델 지수 표시, 로드 후 오프라인 진행, 390px 모바일 가로 넘침을 검사합니다. JSON import attribute를 명시해 브라우저 테스트가 Node 22에서도 실제 엔진과 데이터를 읽도록 했습니다.

## B1 회귀 검사

- 2026-10-18 Reality / 2026-10-19 Save 시작 경계와 스키마 2.
- 실제 Phase A 원본 JSON fixture의 해시와 한국어 거부 안내. 기존 JSON 보관 안내.
- schema 2 왕복·명령 재생·이어하기, 변조/잘못된 구조 거부.
- seed 42 초기/시즌 종료/공표 반전의 고정 golden hash. 재생성 이유와 값은 [결정 기록](DECISIONS.md)에 고정했습니다.
- 기존 `calendar-reports` 파생값 `3281568840`, 수열 `[0,1,1,1,0]` 및 77개 날짜별 스트림 유지. 새 스트림 소비와 독립.
- 32개 레버, 6영역, ID/범위/태그/효과 채널/시차 유효성, 10개 가치 도달성.
- 정확히 96개 코호트, Q6 합=1,000,000, 비음수/조건부 비균등, 고령 Asset & Retirement 비중 우위, 선호와 정당 calibration RNG 분리.
- 초안 변경 전후 및 15주 후 simulation-fields 해시 동일.
- 모든 정당의 공표 변경과 정부 집행의 분리. 미공표 플레이어, 초기 집행값 2, 비집권당 집행 거부.
- 반전 기억(현행 2를 경유해도 보존), 월별 감소, 긴 시차와 윤년/월말 경계. 후속 집행이 이전 발효 효과를 소급 제거하지 않음.
- 20시드 × 77주 모든 이슈/driver 범위, Reality/Seeds 불변, 명령 재생 일치.
- 500개를 넘는 공약 이벤트의 저장/복원, 1,000개 명령 한도와 저장 검사 일치.
- Reality의 Seed/Save 누출, 실제 사실 출처/검증일, 지표 기준일, 전체 data의 금지 조사기관/방송 이름 검출. 기존 국회/인물/시도 매핑 검증 유지.

## 릴리스와 원격 CI

`check`는 개발 검사/빌드/브라우저까지 수행하고 `release`는 엄격한 `build:release`를 수행합니다. 미검증 항목을 해결하기 전에는 release가 실패하고 deploy는 실행되지 않아야 합니다. 원격 상태는 PR의 GitHub Actions 기록이 기준입니다. B1의 새 공개 사이트에서 확인했다고 주장하지 않습니다.

미해결 항목은 주변분포 32개, 교정 타깃 17개, 정부평가 1개, 법제/일정 5개입니다. [결정 기록](DECISIONS.md)의 자료 확인 목록을 참고하세요. 완전한 Reality baseline과 Data Tier 1은 아직 완성되지 않았습니다.

## Phase A의 역사적 기록

기존 3개 파일/26개 테스트와 20시드 달력 배치 해시 `0a465834c62c2719`는 Phase A 기준입니다. 당시 Foundation-only 릴리스는 통과했지만, 정치 데이터를 추가한 B1은 동일한 통과를 주장하지 않습니다. 현재 결과를 위 B1 기록으로 대체했습니다.
