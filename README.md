# HOUSE OF CARDS: KOREA

대한민국 제3정당 경영 시뮬레이션. **Implemented in Phase C1: 창당·자원·재정·정책 연구·내부조사.** C2는 별도 작업입니다.

공개 사이트: https://kingjnu-sakayume.github.io/houseofcards/ — 현재 배포 버전은 main의 GitHub Actions `deploy` 결과가 기준입니다. PR 빌드를 공개 배포 완료로 표현하지 않습니다.

## 구현된 기능

- 플레이어 없는 5개 세력의 세계에서 시작 → 이름·약칭·색상·서로 다른 핵심가치 3개로 한 번 창당. 모든 경로에 창당 게이트와 법적 절차 추상화 안내.
- Money(내부 정수 만원, 화면 백만 원), Staff Capacity, Agenda Slots. 주간 당비·급여 정산, 직원 수준, 미지급금, 최근 100건 원장과 누락분 누계. **원외 정당 국고보조금 없음은 게임 가정입니다.**
- 정책 초안은 무료·시뮬레이션에 영향 없음. 공표는 실제 인력·슬롯을 소비하며 최근 반전에는 추가 비용. 자원 부족 명령은 원자적으로 거부합니다.
- 핵심가치에 맞는 영역의 연구 인력 비용 최대 25% 우대. 4주 연구와 같은 영역의 반복된 일관성 있는 공표로 전문성이 점감 성장합니다. 전문성 → 이슈 소유 → 신뢰 경로만 사용합니다.
- 유료 내부조사(최근 12개). 데이터 허브는 조사 전 잠재·현재·장벽·연령/권역 내부 추정을 숨기며, 조사 뒤에는 조사일과 경과 주를 표시합니다. 공개 가상 조사는 무료입니다.
- 우선순위 5종과 최근 60개 받은 편지. 홈은 우선순위·최신순 주요 알림 최대 5개, 자원과 다음 충전일, 남은 전진 횟수, SCHEDULED 예정 선거일을 표시합니다.
- 기존 전국 정치 모형: 6개 이슈, 32개 레버, 96개 코호트, 공약/정부 집행 분리, 정당 AI와 분기 정부 AI, 가상 조사기관 3곳.
- 잠재 지지는 **모든 정당**의 인지도=100%, 생존가능성=현재 지지 상위 두 정당 V의 평균으로 계산합니다. 신뢰·충성·정체성·정부평가는 유지하며 잠재≥현재를 강제하지 않습니다. 장벽별 반사실은 합산할 수 없습니다.
- 2026-10-19 → 2028-04-10, 77번 전진(시작 포함 월요일 78개). 결정론적 named RNG, 불변 상태, Worker/메인 스레드 동일 엔진, IndexedDB 자동·수동 저장, 전체 명령 재생과 해시 검증.

**Not implemented:** 인재 생성·영입·약속·지역조직 투자·브랜드 일관성(C2), 공천·지역구/비례 선거·전술투표·의석·Election Night(D), Season Review(E). 인재·지역조직 메뉴는 C2, 선거 메뉴는 D 미구현으로 표시합니다. C1 지역 기록은 당원·초기 level만 저장하며 조직 투자 효과를 만들지 않습니다. 가짜 후보·의석을 표시하지 않습니다.

## 실행과 검사

Node.js 22 이상:

```bash
npm ci
npm run dev
# http://localhost:5173/houseofcards/
npm run typecheck
npm run lint
npm test
npm run validate:data
npm run sim -- --seeds 20
npm run build:release
npx playwright install chromium
npm run test:e2e
```

시스템 Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

시뮬레이션은 idle / balanced / housing-focused / spender × 20시드 × 77번 전진으로 자원·원장·거부 원자성·전국 지지 합계·AI 한도·재생을 검사합니다. nightly/manual은 500시드입니다. 전략 순위나 플레이어 지지 목표를 합격 조건으로 두지 않습니다. **개발 모형 검사이며 선거 균형·예측·현실 적합도 검증이 아닙니다.**

## 데이터와 저장

**REAL-WORLD SNAPSHOT: 2026-10-18까지 / SAVE SIMULATION: 2026-10-19부터.**

Reality pack `kr-b2-2026-10-18-r3`는 변경하지 않았습니다. 검증된 행안부 인구와 출처가 있는 정부평가·정당·관측 타깃을 사용하지만, 완성된 선거 baseline이나 모형 교정 완료를 의미하지 않습니다. B2 seed42 초기 관측 타깃 20개 중 15개가 기존 ±5%p 밖이었던 한계는 해결했다고 주장하지 않습니다. [출처 검토](docs/DATA_VERIFICATION.md)를 참고하세요.

정치 모형 계수는 `political-model.json`(B2.1), 새 창당·재정·비용·연구 수치는 엄격한 Zod `party-management.json`(C1.0, GAME_MODEL)입니다. 게임 밸런스 수치를 현실 사실이나 UNVERIFIED_ASSUMPTION으로 추가하지 않습니다. 선언가치는 직접 득표 보너스가 없습니다.

저장은 **스키마 3 / phase C**입니다. A/B1/B2 JSON은 한국어 보관 안내와 함께 거부하며 묵시적으로 생성·마이그레이션하지 않습니다. 기존 JSON을 보관하세요. 명령 한도 **6,000개**, 가져오기 한도 **UTF-8 8,000,000바이트**입니다. 100건 이후 원장의 합은 `ledgerTruncatedSum`에 보존합니다. 여러 탭 동시 사용은 마지막 쓰기가 우선하며 탭 잠금/병합은 미구현입니다.

## CI와 다음 작업

`check`: 타입 검사·lint·unit·자료 검증·C1 20시드/4전략·빌드·Playwright. `release`: 엄격한 자료 검사와 빌드. `deploy`: main에서 두 작업 통과 후에만 실행. `UNVERIFIED_ASSUMPTION` 주입 시 릴리스 실패 검사를 유지합니다. `/houseofcards/` base와 HashRouter를 유지하며, 로드 후에는 외부 API 없이 진행합니다. 서비스 워커/PWA는 없습니다.

[Slice Spec](docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md), [C1/C2 작업 지시](docs/HOUSE_OF_CARDS_KOREA_phase_c_rev1.md), [결정 기록](docs/DECISIONS.md), [검증 결과](docs/VALIDATION.md).

남은 작업의 순서는 [로드맵](docs/ROADMAP.md)에, 현재 위치는 [진행 기록](docs/PROGRESS.md)에 있습니다. 다음 단계는 **C2a 가상 정치인**입니다. Phase D 데이터 준비(DD1~DD3)는 C2와 병행할 수 있습니다.

C1 saves는 자동으로 확장하지 않고, C2 스키마/단계 호환 정책을 적용합니다. 실존 핵심 인물은 검증된 Data Tier 2 자료가 없어 유예했으며, C2는 가상 Full 인물만 구현합니다. Phase D/E는 아직 시작하지 않았습니다.
