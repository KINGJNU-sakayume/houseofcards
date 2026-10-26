// U2 "정국 브리핑" templates. Fictional headlines for the save's simulated issues
// (Slice §15 examples); never real news, outlets or quotes.
export const MASTHEAD = { name: '주간 정국 브리핑', note: '가상 매체 · 이 세이브의 게임 모형으로 쓴 기사입니다. 실제 보도·통계가 아닙니다.' };

export const DRIVER_STORIES: Record<string, { up: string; down: string }> = {
  'housing-supply': { up: '수도권 신규 공급 지연, 집값 불안 다시 고개', down: '공급 확대 기대에 주택시장 숨 고르기' },
  'financing-stress': { up: '대출 이자 부담에 내 집 마련 세대 상환 압박', down: '주택담보대출 부담 다소 완화' },
  'rental-stress': { up: '수도권 월세 부담 다시 커져', down: '전월세 시장 안정세, 세입자 한숨 돌려' },
  'family-housing-burden': { up: '신혼부부 내 집 마련 더 멀어져', down: '신혼·출산 가구 주거 부담 완화 조짐' },
  'childcare-burden': { up: '돌봄 공백에 맞벌이 가구 한숨', down: '돌봄 인프라 확충 체감 늘어' },
  'work-family-stress': { up: '육아휴직 여전히 눈치, 일·가정 양립 제자리', down: '일·가정 양립 문화 확산 신호' },
  'contribution-burden': { up: '연금 보험료 인상 논쟁 가열', down: '보험료 부담 논란 진정세' },
  'retirement-insecurity': { up: '노후 소득 불안 호소 늘어', down: '노후 대비 불안 다소 진정' },
  'fiscal-risk': { up: '연금 기금 고갈 시계 빨라졌다는 우려', down: '연금 재정 전망 소폭 개선' },
  'regional-access-gap': { up: '지역 필수의료 공백 확대', down: '지역 의료 접근성 개선 신호' },
  'workforce-shortage': { up: '응급실·소아과 인력난 심화', down: '필수 의료 인력 수급에 숨통' },
  'care-cost-pressure': { up: '의료비 부담에 서민 가계 압박', down: '의료비 부담 완화 체감' },
  'investment-gap': { up: '기업 투자 위축 우려 커져', down: '설비 투자 회복세' },
  'infrastructure-gap': { up: 'AI 데이터센터 부지·전력망 확보 난항', down: '산업 인프라 확충에 속도' },
  'energy-pressure': { up: 'AI 데이터센터 전력 수요 논쟁', down: '에너지 수급 부담 한결 덜어' },
  'research-gap': { up: '연구개발 투자 공백 지적 잇따라', down: '연구개발 투자 확대 효과 나타나' },
  'global-demand-pressure': { up: '세계 수요 둔화에 수출 경고등', down: '수출 회복 기대감 커져' },
  'institutional-distrust': { up: '정치 불신 다시 고조', down: '정치권 신뢰 회복 조짐' },
  'representation-gap': { up: '"청년·지역 목소리 국회에 안 닿는다" 지적', down: '대표성 개선 논의 진전' },
};

export const ISSUE_KICKERS: Record<string, string> = {
  housing: '주거', family: '저출생·가족', pension: '연금', healthcare: '의료', 'industry-ai': '산업·AI', 'political-reform': '정치개혁',
};
