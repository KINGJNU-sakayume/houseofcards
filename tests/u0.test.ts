import { describe, expect, it } from 'vitest';
import legacyF2 from './fixtures/phase-f2-v14.json' with { type: 'json' };
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave } from '../src/persistence/codec';
import { formatDate, formatMoney, formatSignedMoney, formatWon, grade, weekdayOf } from '../src/components/format';
import { shortage } from '../src/engine/parties/management';
import { createFoundedGame } from './helpers';

describe('U0 Korean display formatting', () => {
  it('shows money in 억/만원 units, never M/B', () => {
    expect(formatMoney(0)).toBe('0원');
    expect(formatMoney(3000)).toBe('3,000만원');
    expect(formatMoney(150000)).toBe('15억원');
    expect(formatMoney(152500)).toBe('15억 2,500만원');
    expect(formatMoney(-1500)).toBe('−1,500만원');
    expect(formatSignedMoney(800)).toBe('+800만원');
    expect(formatWon(15_000_000)).toBe('1,500만원');
  });
  it('computes the weekday and grades 0–100 values', () => {
    expect(weekdayOf('2026-10-19')).toBe('월');
    expect(formatDate('2028-04-12', true)).toBe('2028년 4월 12일 (수)');
    expect([10, 40, 55, 70, 90].map(grade)).toEqual([1, 2, 3, 4, 5]);
  });
  it('refusal reasons are Korean', () => {
    const s = createFoundedGame(1);
    expect(shortage({ ...s, resources: { ...s.resources!, staffCapacity: 0 } }, { staffCapacity: 2 })).toBe('실무 인력이 부족합니다 (필요 2, 보유 0)');
    expect(shortage({ ...s, resources: { ...s.resources!, money: 0 } }, { money: 1500 })).toBe('자금이 부족합니다 (필요 1,500만원, 보유 0만원)');
  });
});

describe('U0 saves', () => {
  it('rejects real F2 saves (schema 14) with Korean keep-JSON guidance', () => {
    expect(legacyF2.state.schemaVersion).toBe(14); expect(legacyF2.checksum).toBe(stateHash(legacyF2.state));
    expect(() => deserializeSave(JSON.stringify(legacyF2))).toThrow('F2 세이브(스키마 14)는 화면 문구가 한국어로 바뀐 현재 버전(스키마 16)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
