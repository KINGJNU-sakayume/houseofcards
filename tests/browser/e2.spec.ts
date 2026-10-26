import { expect, test, type Page } from '@playwright/test';
import { createFoundedGame } from '../helpers';
import { dispatchCommand } from '../../src/engine/simulation/engine';
import { serializeSave } from '../../src/persistence/codec';
import { nominationModel as nm } from '../../src/data/seeds/nomination';
import type { GameState } from '../../src/types/game';

// A real save at the nomination stage with one real recruit.
function nominationSave(): GameState {
  let s = createFoundedGame(42);
  while (s.date < nm.gates.nominations) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
  for (const p of s.politicians.filter(x => x.status === 'prospect')) {
    if (s.politicians.some(x => x.status === 'recruited')) break;
    try { s = dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: ['primary_guarantee', 'regional_priority'] }); } catch { /* refused */ }
  }
  return s;
}
// Every visible form control has an accessible name (aria-label/labelledby, a label, or button text).
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('input, select, textarea, button')].filter(el => {
    const e = el as HTMLElement;
    if (!e.offsetParent && e.getAttribute('type') !== 'file') return false;
    if (e.getAttribute('aria-label')?.trim() || e.getAttribute('aria-labelledby') || e.getAttribute('title')?.trim()) return false;
    if (e.tagName === 'BUTTON') return !e.textContent?.trim();
    const id = e.getAttribute('id');
    return !e.closest('label')?.textContent?.trim() && !(id && document.querySelector(`label[for="${id}"]`));
  }).map(e => `${e.tagName.toLowerCase()}#${e.id}.${e.className}`));
}

test('E2: list warning, Vote Flow after a survey, and named controls on every page', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByLabel('JSON 가져오기', { exact: true }).setInputFiles({ name: 'e2.json', mimeType: 'application/json', buffer: Buffer.from(serializeSave(nominationSave())) });
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  await page.getByRole('link', { name: '선거', exact: false }).click();
  await expect(page.getByTestId('list-warning')).toContainText('정당투표에 우리 정당이 오르지 않습니다');
  await page.getByRole('link', { name: '데이터 허브', exact: false }).click();
  await page.getByRole('button', { name: /내부조사 의뢰/ }).click();
  await expect(page.getByTestId('vote-flow')).toContainText('Vote Flow');
  await expect(page.getByTestId('vote-flow').locator('tbody tr').first()).toBeVisible();
  for (const path of ['', 'korea', 'policy', 'party', 'politicians', 'organization', 'election', 'data', 'review']) {
    await page.goto(`./#/${path}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    expect(await unnamedControls(page), path).toEqual([]);
  }
  expect(errors).toEqual([]);
});
