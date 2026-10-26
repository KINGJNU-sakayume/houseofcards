import { expect, test } from '@playwright/test';
import { createFoundedGame } from '../helpers';
import { dispatchCommand } from '../../src/engine/simulation/engine';
import { stateHash } from '../../src/engine/simulation/determinism';
import type { Command } from '../../src/types/game';

test('C2 full loop: found, publish with cost, survey, recruit, invest, refused reason, months, save/reload hash, honest stubs', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./#/organization');
  await page.getByLabel('정당 이름', { exact: true }).fill('내일의 정당');
  await page.getByLabel('약칭', { exact: true }).fill('내일');
  for (const value of ['주거개혁', '사회안전망', '과학기술']) await page.getByRole('checkbox', { name: value, exact: false }).check();
  await page.getByRole('button', { name: '정당 창당', exact: true }).click();
  await expect(page.getByRole('heading', { name: '지역에 뿌리내리다' })).toBeVisible();
  await expect(page.getByTestId('org-limits')).toContainText('투표율 동원은 구현하지 않았습니다');
  await page.getByRole('link', { name: '정책', exact: false }).click();
  await expect(page.getByText('공표 비용: 실무 인력 1 · 의제 슬롯 1').first()).toBeVisible();
  await page.getByRole('radio', { name: '임대지원 확대 4단계' }).click();
  await expect(page.getByRole('radio', { name: '임대지원 확대 4단계' })).toBeChecked();
  await page.getByRole('button', { name: '임대지원 확대 공표' }).click();
  await expect(page.getByTestId('published-housing.rent-support')).toContainText('공표 4');
  await page.getByRole('link', { name: '데이터 허브', exact: false }).click();
  await page.getByRole('button', { name: '내부조사 의뢰', exact: true }).click();
  await expect(page.getByTestId('current-support')).toBeVisible();
  const initial = createFoundedGame(20261019);
  const person = [...initial.politicians].sort((a, b) => a.name.localeCompare(b.name, 'ko'))[0]!;
  await page.getByRole('link', { name: '인재', exact: false }).click();
  await page.getByRole('button', { name: '영입 제안', exact: true }).click();
  await page.getByRole('link', { name: '지역조직', exact: false }).click();
  await page.getByLabel('종류', { exact: false }).selectOption('policy_forum');
  await expect(page.getByText('비용: 3,000만원 · 실무 인력 2 · 3주 소요')).toBeVisible();
  await page.getByRole('button', { name: '투자 시작', exact: true }).click();
  await expect(page.getByTestId('region-seoul')).toContainText('정책간담회 강도 1');
  await expect(page.getByTestId('invest-refusal')).toContainText('이미 진행 중');
  await expect(page.getByRole('button', { name: '투자 시작', exact: true })).toBeDisabled();
  for (let i = 0; i < 6; i++) { await page.getByRole('button', { name: '다음 주로' }).click(); await expect(page.getByRole('button', { name: '다음 주로' })).toBeEnabled(); }
  await expect(page.getByTestId('region-seoul')).toContainText('정책간담회 ~');
  const commands: Command[] = [{ type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 }, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' }, { type: 'COMMISSION_INTERNAL_SURVEY' },
    { type: 'RECRUIT_POLITICIAN', politicianId: person.id, role: 'member', promises: [] }, { type: 'INVEST_REGION', regionId: 'seoul', kind: 'policy_forum', intensity: 1 },
    ...Array.from({ length: 6 }, (): Command => ({ type: 'ADVANCE_WEEK' }))];
  let expected = initial; for (const c of commands) expected = dispatchCommand(expected, c);
  await page.reload();
  await page.getByRole('button', { name: '저장 / 불러오기' }).click(); await page.getByText('저장 무결성 정보').click();
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(expected));
  await page.getByRole('button', { name: '닫기', exact: false }).first().click();
  await page.goto('./#/election');
  await expect(page.getByRole('heading', { name: '이 세이브의 선거제도' })).toBeVisible();
  await expect(page.getByText('시즌 결과 페이지에', { exact: false }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['organization', 'politicians', 'party']) {
    await page.goto(`./#/${path}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
  }
  await page.goto('./#/organization'); await page.screenshot({ path: 'test-results/c2c-organization-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
