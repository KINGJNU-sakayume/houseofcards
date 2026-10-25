export const NAVIGATION = [
  { path: '/', label: '홈', english: 'HOME', icon: 'home', phase: 'A', description: '이번 주의 일정과 받은 편지를 확인합니다.' },
  { path: '/korea', label: '대한민국', english: 'KOREA', icon: 'globe', phase: 'B2', description: '주택, 가족, 연금, 의료, 산업·AI, 정치개혁의 사회 이슈를 살펴봅니다.' },
  { path: '/policy', label: '정책', english: 'POLICY', icon: 'policy', phase: 'C1', description: '공약의 초안과 공표를 구분하고, 정책이 유권자에게 전달되는 과정을 살펴봅니다.' },
  { path: '/party', label: '우리 정당', english: 'PARTY', icon: 'flag', phase: 'C1', description: '새 정당을 창당하고 세 가지 핵심가치로 방향을 정합니다.' },
  { path: '/politicians', label: '인재', english: 'POLITICIANS', icon: 'people', phase: 'C2', description: '가상 인재 후보가 생성됩니다. 영입·역할·약속 관리는 C2b에서 열립니다.' },
  { path: '/organization', label: '지역조직', english: 'ORGANIZATION', icon: 'map', phase: 'C2', description: '여덟 권역에 조직을 키워 후보 발굴과 캠페인의 기반을 만듭니다.' },
  { path: '/election', label: '선거', english: 'ELECTION', icon: 'ballot', phase: 'D', description: '목표 지역구, 공천, 비례명부와 마지막 12주의 캠페인을 준비합니다.' },
  { path: '/data', label: '데이터 허브', english: 'DATA HUB', icon: 'chart', phase: 'C1 / E', description: '잠재 지지와 현재 지지의 차이, 연령·권역별 지지, 표의 이동을 분석합니다.' },
] as const;
