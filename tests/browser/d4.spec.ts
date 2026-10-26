import { expect, test } from '@playwright/test';
import { formatDate } from '../../src/components/format';
import { createFoundedGame } from '../helpers';
import { dispatchCommand } from '../../src/engine/simulation/engine';
import { stateHash } from '../../src/engine/simulation/determinism';
import { serializeSave } from '../../src/persistence/codec';
import { districtPack } from '../../src/data/reality/districts';
import { nominationModel as nm } from '../../src/data/seeds/nomination';
import { electionModel as em } from '../../src/data/seeds/election';
import type { Command, GameState } from '../../src/types/game';

// A real save at the Final Push start: published housing pledge, one real recruit nominated.
function pushSave(): { state: GameState; districtId: string } {
  let s = createFoundedGame(42);
  for (const c of [{ type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 }, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' }] as Command[]) s = dispatchCommand(s, c);
  while (s.date < nm.gates.nominations) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
  for (const p of s.politicians.filter(x => x.status === 'prospect')) {
    if (s.politicians.some(x => x.status === 'recruited')) break;
    try { s = dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: ['primary_guarantee', 'regional_priority'] }); } catch { /* refused */ }
  }
  const recruit = s.politicians.find(p => p.status === 'recruited')!;
  const district = districtPack.districts.find(d => d.active)!;
  s = dispatchCommand(dispatchCommand(s, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }), { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [recruit.id] });
  while (s.date < em.finalPush.start) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
  return { state: s, districtId: district.id };
}

test('D4: Final Push allocation, the election on the last week and the saved result', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const { state, districtId } = pushSave();
  const name = districtPack.districts.find(d => d.id === districtId)!.name;
  await page.goto('./');
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByLabel('JSON 가져오기', { exact: true }).setInputFiles({ name: 'd4.json', mimeType: 'application/json', buffer: Buffer.from(serializeSave(state)) });
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  await page.getByRole('link', { name: '선거', exact: false }).click();
  const push = page.getByTestId('final-push');
  await expect(page.getByTestId('final-push-status')).toContainText('진행 중');
  await push.getByLabel('전국 메시지').selectOption('housing');
  await expect(push.getByLabel('전국 메시지')).toHaveValue('housing');
  await push.getByLabel(`${name} 유세 강도`).selectOption('2');
  await expect(page.getByTestId('final-push-status')).toContainText(`자금 ${(2 * em.finalPush.weeklyMoneyPerIntensity).toLocaleString('ko-KR')}만원`);
  let expected = dispatchCommand(state, { type: 'SET_MESSAGES', national: 'housing', secondary: [] });
  expected = dispatchCommand(expected, { type: 'SET_CAMPAIGN', districtId, intensity: 2 });
  while (expected.status === 'active') {
    await page.getByRole('button', { name: '다음 주로' }).click();
    expected = dispatchCommand(expected, { type: 'ADVANCE_WEEK' });
    await expect(page.getByTestId('topbar-date')).toContainText(formatDate(expected.date), { timeout: 20_000 });
  }
  await page.getByRole('link', { name: '선거', exact: false }).click();
  const results = page.getByTestId('election-results');
  await expect(results).toContainText('2028-04-12 총선 결과');
  await expect(page.getByTestId('player-result')).toContainText(`${expected.election!.totalSeats.player ?? 0}석`);
  await expect(page.getByTestId('player-result')).toContainText(expected.election!.outcome === 'in_parliament' ? '원내 진입' : '원외 정당으로 존속');
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByText('저장 무결성 정보').click();
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(expected));
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
