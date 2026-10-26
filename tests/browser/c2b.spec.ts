import { expect, test } from '@playwright/test';
import { createFoundedGame } from '../helpers';
import { dispatchCommand } from '../../src/engine/simulation/engine';
import { stateHash } from '../../src/engine/simulation/determinism';
import type { Command } from '../../src/types/game';

test('C2b prospects, qualitative band, recruit with promise, refusal reason, save/reload hash and mobile layout', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/politicians');
  await page.getByLabel('정당 이름', { exact: true }).fill('내일의 정당');
  await page.getByLabel('약칭', { exact: true }).fill('내일');
  for (const value of ['주거개혁', '사회안전망', '과학기술']) await page.getByRole('checkbox', { name: value, exact: false }).check();
  await page.getByRole('button', { name: '정당 창당', exact: true }).click();
  await expect(page.getByRole('heading', { name: '함께할 사람을 찾다' })).toBeVisible();
  await expect(page.getByText('영입 후보 30명', { exact: false })).toBeVisible();
  await expect(page.getByText('실존 인물과 무관하며', { exact: false }).first()).toBeVisible();
  const expected0 = createFoundedGame(20261019);
  const first = [...expected0.politicians].sort((a, b) => a.name.localeCompare(b.name, 'ko'))[0]!;
  // U5: the roster is a full-width table; a row opens the profile modal.
  await page.locator('.person-button').filter({ hasText: first.name }).click();
  const detail = page.getByTestId('politician-detail');
  await expect(detail.getByText('막판 총력전 유세 누적 효율', { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId('recruit-band')).toHaveText(/낮음|보통|높음/);
  await expect(detail.getByRole('heading', { name: first.name })).toBeVisible();
  await detail.getByRole('checkbox', { name: '총선 경선 보장', exact: false }).check();
  await page.getByRole('button', { name: '영입 제안', exact: true }).click();
  const commands: Command[] = [{ type: 'RECRUIT_POLITICIAN', politicianId: first.id, role: 'member', promises: ['primary_guarantee'] }];
  let expected = expected0; for (const c of commands) expected = dispatchCommand(expected, c);
  const outcome = expected.politicians.find(p => p.id === first.id)!.status;
  // The outcome is shown in a result modal; its profile button reopens the person.
  await expect(page.getByTestId('recruit-result')).toContainText(outcome === 'recruited' ? '영입 성공' : '거절했습니다');
  await page.getByRole('button', { name: '프로필 보기' }).click();
  if (outcome === 'recruited') {
    await expect(page.getByTestId('politician-detail')).toContainText('등록 마감(2028-03-20)에 공천 결과로 판정');
  } else {
    await expect(page.getByTestId('recruit-refusal')).toContainText('재접촉 대기');
    await expect(page.getByRole('button', { name: '영입 제안', exact: true })).toBeDisabled();
  }
  await page.getByTestId('politician-detail').getByRole('button', { name: '닫기' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/c2b-politicians-mobile.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: '함께할 사람을 찾다' })).toBeVisible();
  await page.getByRole('button', { name: '저장 / 불러오기' }).click(); await page.getByText('저장 무결성 정보').click();
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(expected));
  expect(errors).toEqual([]);
});
