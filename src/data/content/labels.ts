export const REGION_LABELS: Record<string, string> = { seoul: '서울', 'gyeonggi-incheon': '경기·인천', chungcheong: '충청', tk: '대구·경북', pk: '부산·울산·경남', honam: '호남', gangwon: '강원', jeju: '제주' };
export const DRIVER_LABELS: Record<string, string> = {
  'housing-supply': '주택 공급 부족', 'financing-stress': '주거 금융 부담', 'rental-stress': '임차 부담',
  'family-housing-burden': '가족의 주거 부담', 'childcare-burden': '돌봄·교육 부담', 'work-family-stress': '일·가정 양립 부담',
  'contribution-burden': '보험료 부담', 'retirement-insecurity': '노후 소득 불안', 'fiscal-risk': '연금 재정 압력',
  'regional-access-gap': '지역 의료 접근 격차', 'workforce-shortage': '필수 의료인력 부족', 'care-cost-pressure': '의료비 압력',
  'investment-gap': '산업 투자 부족', 'infrastructure-gap': '산업 기반 부족', 'energy-pressure': '에너지 부담', 'research-gap': '연구개발 부족', 'global-demand-pressure': '세계 수요 압력',
  'institutional-distrust': '제도 신뢰의 압력', 'representation-gap': '대표성 격차',
};
export const PROFILE_LABELS: Record<string, string> = { 'housing-pressure': '주거 압박(Housing Pressure)', 'family-work': '가족·일(Family Work)', 'asset-retirement': '자산·노후(Asset Retirement)' };
export const cohortLabel = (id: string) => { const [region, age, profile] = id.split('/'); return `${REGION_LABELS[region!] ?? region} ${age} ${PROFILE_LABELS[profile!] ?? profile}`; };
// Display colours for charts and capsules only (UI convention, not official party branding).
export const PARTY_COLORS: Record<string, string> = { dp: 'var(--party-dp)', ppp: 'var(--party-ppp)', reform: 'var(--party-reform)', rkp: 'var(--party-rkp)', 'minor-bloc': 'var(--party-minor-bloc)', none: 'var(--party-none)' };
export const STEP_LABELS = ['축소', '일부 축소', '현행 유지', '확대', '대폭 확대'] as const;
export const LEDGER_LABELS: Record<string, string> = { dues: '당비', donations: '후원금', payroll: '급여·임대료', hiring: '직원 채용', research: '정책 연구·공표', survey: '내부조사', recruitment: '인재 영입', organization: '지역조직', nomination: '공천', deposit: '기탁금', campaign: '유세', reimbursement: '선거비용 보전' };
