import { expect, test } from '@playwright/test';
import { createFoundedGame } from '../helpers';
import { dispatchCommand } from '../../src/engine/simulation/engine';
import { stateHash } from '../../src/engine/simulation/determinism';
import { serializeSave } from '../../src/persistence/codec';
import { districtPack } from '../../src/data/reality/districts';
import { nominationModel as nm } from '../../src/data/seeds/nomination';
import type { GameState } from '../../src/types/game';

// A real save at the nomination stage: weekly advances and real recruitment attempts only.
function nominationSave(): GameState {
  let s = createFoundedGame(42);
  while (s.date < nm.gates.nominations) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
  for (const p of s.politicians.filter(x => x.status === 'prospect')) {
    if (s.politicians.some(x => x.status === 'recruited')) break;
    try { s = dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: ['primary_guarantee', 'regional_priority'] }); } catch { /* refused */ }
  }
  return s;
}

test('D3: target an Active district, nominate a recruit, see the nominee in the district estimate, and keep the hash', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const save = nominationSave();
  const recruit = save.politicians.find(p => p.status === 'recruited')!;
  const district = districtPack.districts.find(d => d.active)!;
  await page.goto('./');
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByLabel('JSON 가져오기', { exact: true }).setInputFiles({ name: 'd3.json', mimeType: 'application/json', buffer: Buffer.from(serializeSave(save)) });
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  await page.getByRole('link', { name: '선거', exact: false }).click();
  const panel = page.getByTestId('nomination-panel');
  await expect(page.getByTestId('nomination-stage')).toContainText('2단계 공천');
  await expect(page.getByTestId('district-explorer').locator('tbody tr').first()).toContainText('후보 없음');
  const row = page.getByTestId('target-table').locator('tr', { hasText: district.name }).first();
  await row.getByRole('checkbox').click();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await expect(row).toContainText('후보 없음');
  await panel.getByLabel('지역구').selectOption(district.id);
  await panel.getByRole('group', { name: '공천 후보' }).getByRole('checkbox', { name: recruit.name, exact: false }).check();
  await panel.getByRole('button', { name: '공천', exact: true }).click();
  await expect(row).toContainText(`${recruit.name} · 전략공천`);
  await expect(page.getByTestId('district-explorer')).toContainText(`후보 ${recruit.name}`);
  await expect(page.getByTestId('list-refusal')).toContainText(`${nm.gates.list}부터`);
  let expected = dispatchCommand(save, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true });
  expected = dispatchCommand(expected, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [recruit.id] });
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByText('저장 무결성 정보').click();
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(expected));
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
