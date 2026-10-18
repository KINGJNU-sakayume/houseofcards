# Phase A validation

## 자동 검사 범위

- 순수 엔진은 DOM/Node global 타입 없이 ES2022만으로 별도 타입 검사한다.
- 월요일 78개 / 주간 전진 77회, 월말 틱, 윤년/연도 경계, 마지막 주 정지.
- RNG 기준 수열, 스트림/시드/날짜 격리, 범위 검사.
- 고정소수점 반올림과 exp 근사/단조성.
- 원본 불변성, canonical hash, 전체 명령 재생 일치.
- JSON 세이브/로드 후 이어하기, 손상/버전/불가능 상태 거부.
- IndexedDB 자동·수동 슬롯 분리.
- §33의 각 데이터 규칙을 위반하는 synthetic fixture 검출.
- 실제 Chromium에서 Worker/메인 스레드 일치, 자동저장 새로고침 복원, 수동 저장, JSON 가져오기/거부, 하위 경로 새로고침, 로드 후 오프라인 진행, 모바일 가로 넘침 검사.

정치 모델/선거 결과/AI 밸런스는 아직 없으므로 검증 대상이 아니다. GitHub Actions 실행 기록이 원격 CI와 배포 결과의 기준이다.

## 2026-10-18 로컬 결과

- `npm run typecheck`, `npm run lint`: 통과.
- `npm test`: 3개 파일, 26개 테스트 통과.
- `npm run validate:data -- --release`: 통과. FOUNDATION_ONLY 경고는 의도된 불완전성 표시.
- `npm run sim -- --seeds 20`: 20개 시드 × 77번 전진, 세이브/재생 해시 일치. 배치 해시 `0a465834c62c2719`.
- `npm run build:release`: 통과. UI와 별도 Worker 번들 생성.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 2개 브라우저 시나리오 통과.
- Chromium 화면 확인: 1440px 데스크톱과 390px 모바일, 넘침/겹침 없음.

달력 테스트에서 원본의 77틱 표현과 실제 날짜 산술 차이를 발견했다. 날짜는 유지하며 78개 월요일 / 77번 전진으로 구현했다. [결정 기록](DECISIONS.md)을 참고한다.
