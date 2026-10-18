// Kept outside src/data: the validator scans all data documents against this list.
export const FORBIDDEN_POLL_MEDIA_NAMES = [
  '한국갤럽', 'Gallup Korea', '리얼미터', 'Realmeter', '전국지표조사',
  '엠브레인', 'Embrain', '케이스탯', 'KSTAT', '코리아리서치', 'Korea Research',
  '한국리서치', 'Hankook Research', 'KBS', 'MBC', 'SBS', 'JTBC', 'YTN', '연합뉴스TV',
  'TV조선', '채널A', 'MBN',
] as const;
export function forbiddenNamesIn(value: unknown): string[] {
  const text = JSON.stringify(value).normalize('NFKC').toLowerCase();
  return FORBIDDEN_POLL_MEDIA_NAMES.filter(name => text.includes(name.normalize('NFKC').toLowerCase()));
}
