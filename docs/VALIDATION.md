# Phase B2 validation · 2026-10-18

B1 PR #1은 main merge `a6cd47b3193e8fc0bcc2c19cbe2571026b62c37f`로 병합하고 선행 검사를 통과했습니다. B2의 검증 범위는 전국 정치 판단·AI·가상 조사·화면·저장/재생입니다. 지역구·선거·의석 밸런스와 실제 데이터 교정은 포함하지 않습니다.

## 로컬 결과

- `npm run typecheck`, `npm run lint`: 통과. 순수 엔진은 DOM/React가 없는 ES2022 설정에서도 검사합니다.
- `npm test`: **5개 파일, 59개 테스트 통과** (68.19초).
- `npm run validate:data`: 통과, **56개 UNVERIFIED_ASSUMPTION 경고**.
- `npm run build:release`: **exit 1, 미검증 56개 때문에 기대된 차단**. 오류를 무시하거나 배포를 우회하지 않았습니다.
- `npm run sim -- --seeds 20`: **20시드 × 3전략 × 77번 전진 통과**, 모든 20시드에서 첫 월간 주거 공표의 Potential 변화가 Current 변화보다 큼. 배치 해시 `22ee79f712bb93ec`.
- `npm run build`: 통과, 별도 Worker 번들 생성. 의존성의 PURE 주석에 대한 비차단 Rollup 경고가 있습니다.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: **4개 Chromium 시나리오 통과**.
- 데스크톱 정책 및 모바일 데이터 허브 스크린샷 확인, 390px 가로 넘침 없음.
- `git diff --check`: 통과.

## B2 모형 검사

- 공표값만 사용하는 관심도 가중 적합도, 일치/불일치 및 핵심 관심 영역 반응.
- 분석적 consideration-set 전수 열거: 수계산 softmax/부분집합 사례, 인지도 단조성, 96개 코호트 및 전국/연령/권역 합계=1,000,000, 모형 유도 none.
- 사용자 확정 Slice Spec의 **전체 정당** A=1/V=중립 Potential. 신뢰·충성·정체성·정부평가 유지, 대정당 Potential 강제 상향 없음, 낮은 인지도·V의 Current 장벽.
- 초안 무효, 공표 직후 분석 불변, 월간 갱신 이후 Potential보다 작은 Current 반응, 신뢰의 일관성/재정부담 의존.
- 인지도·정체성·소유 관성, 전문성 고정, 충성 침식 한도.
- 정부평가 0/부호/반올림 이내 zero-sum 배분.
- 직전 조사만 쓰는 V, 동일 틱 조사/숨겨진 지지 미사용, 월간 한도, Ruleset 문턱과 S 곡선.
- 기관 편향의 단일 draw/지속, 표본 stream 재현/변화, 부동층, 표본크기에서 유도한 오차와 넓은 하위집단 범위.
- 전국 구간 coverage: 테스트 전용 6%/35% 진실값 × 300시드, 구성된 허용 대역 .88~.995 통과. 모든 하위집단에 대한 명목 95% 보증은 아닙니다.
- AI의 같은 seed 재현, 월/분기 cap, 공약 다양성 하한, 숨겨진 Current/인지도/충성을 바꿔도 동일한 결정.
- 정부 AI의 자기 공약 집행과 분기 한도, 야당 공표와 집행 분리, 효과 시차.
- 교정 타깃 17개 **UNVERIFIED 보고**, 검증된 synthetic fixture의 허용 오차 검사. 실제 baseline 교정 통과를 주장하지 않습니다.
- 스키마 2/B2 세이브 왕복과 전체 정치 명령 replay, B1 프리뷰 명시적 거부.
- seed 42 B2 golden: 초기 `743540557de1b07e`, 시즌 종료 `792d5e3326991beb`, 공표/반전 `7dbbde70e83bbcfc`. 생성 근거는 [결정 기록](DECISIONS.md).

세 전략은 balanced(6영역 순환 공표), idle(플레이어 변경 없음), housing-focused(주거만 공표)입니다. 이슈/driver·확률 범위, 정확한 합계, 월간 지지 변화 cap, AI cap/다양성, 세이브 replay를 매 실행에서 검사합니다. 최종 플레이어 Current 범위는 balanced 1.3131~1.5653%, idle .4462~.4997%, housing-focused .4472~.5009%입니다. 개발 Seeds에서 나온 수치이며 현실 예측이나 장기 선거 밸런스가 아닙니다.

## 브라우저와 기반 회귀

Playwright는 실제 Worker/메인 스레드 동일 해시, 자동저장 새로고침, 수동 저장과 JSON 왕복, Phase A/잘못된 JSON 거부 후 현재 상태 유지, HashRouter 하위 경로 새로고침, 여러 월 진행과 보고 라벨, 로드 후 오프라인 진행, 모바일 가로 넘침을 검사합니다. B2 시나리오는 초안/공표의 분리와 새로고침 보존, 월간 진행, 대한민국 12개 지수 meter, 가상 전국 조사 부동층과 권역별 화면을 확인합니다.

B1 회귀도 유지합니다: 2026-10-18/19 경계, 실제 Phase A fixture 거부, 불변 Reality/Seeds, 32레버와 96코호트, Q6 질량, 공약/집행 분리, 반전 기억/감소, 긴 시차와 윤년 경계, 명령/이벤트 한도, 엄격 데이터 구조·출처·금지 조사기관/방송 이름 검사. calendar-reports 파생값 `3281568840`과 `[0,1,1,1,0]` 수열을 바꾸지 않았습니다.

## 릴리스와 원격 CI

`check`는 개발 검사·20시드×3전략·빌드·브라우저를 수행합니다. `release`는 strict `build:release`를 별도 수행하며 **현재 실패해야 합니다**. `deploy`는 둘 다 통과한 main에만 허용합니다. 원격 실행 상태는 B2 PR의 GitHub Actions 기록이 기준입니다. 새 B2 공개 사이트에서 검증했다는 뜻이 아닙니다.

미해결은 주변분포 32개, 교정 타깃 17개, 실제 정부평가 1개, 법제/일정 5개, 명시적 중립 정부평가 fallback 1개입니다. 전체 Reality baseline 및 Data Tier 1은 아직 미완성입니다. 후속 Phase C도 시작하지 않았습니다.

## 역사적 기준

Phase A: 26개 unit, 달력 배치 해시 `0a465834c62c2719`.

Phase B1: 40개 unit, 3개 E2E, 20시드 이슈/코호트 배치 해시 `2966620a1f85ce19`, 미검증 55개로 릴리스 차단. B1 golden fixture는 역사적 기준으로 보존하며 현재 B2 상태 해시와 혼용하지 않습니다.
