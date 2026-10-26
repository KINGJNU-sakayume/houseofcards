import { createFoundedGame as createGame } from '../helpers';
import { expect, test } from '@playwright/test';
import { dispatchCommand } from '../../src/engine/simulation/engine';
import { stateHash } from '../../src/engine/simulation/determinism';
import { serializeSave } from '../../src/persistence/codec';
import legacySave from '../fixtures/phase-a-v1.json' with { type: 'json' };

async function found(page: import('@playwright/test').Page) {
  await page.getByLabel('정당 이름', { exact: true }).fill('내일의 정당');
  await page.getByLabel('약칭', { exact: true }).fill('내일');
  for (const value of ['주거개혁', '사회안전망', '과학기술']) await page.getByRole('checkbox', { name: value, exact: false }).check();
  await page.getByRole('button', { name: '정당 창당', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '자동저장 완료' })).toBeVisible();
}
test.beforeEach(async ({ page }) => { await page.goto('./'); await found(page); });

test('real Worker, calendar, IndexedDB reload, hash-route refresh and JSON round trip', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: '다음 주로' })).toBeEnabled();
  await expect(page.getByTestId('game-date')).toHaveText('2026.10.19');
  await page.getByRole('button', { name: '다음 주로' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('2026.10.26');
  await expect(page.getByRole('status').filter({ hasText: '자동저장 완료' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('game-date')).toHaveText('2026.10.26');
  await page.getByRole('link', { name: '정책', exact: false }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '어떤 입장을 공표할까요?' })).toBeVisible();
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByText('저장 무결성 정보').click();
  await expect(page.getByText('스키마 8 · 엔진 Web Worker', { exact: false })).toBeVisible();
  const advanced = dispatchCommand(createGame(20261019), { type: 'ADVANCE_WEEK' });
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(advanced));
  await page.getByRole('button', { name: '수동 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '수동 저장을 완료' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON 내보내기' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('2026-10-26');
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  await page.getByRole('button', { name: '다음 주로' }).click();
  await expect(page.getByRole('status').filter({ hasText: '자동저장 완료' })).toBeVisible();
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByRole('button', { name: '수동 저장 불러오기' }).click();
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await page.getByText('저장 무결성 정보').click();
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(advanced));
  const imported = createGame(777);
  await page.getByLabel('JSON 가져오기', { exact: true }).setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(serializeSave(imported)) });
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(imported));
  await page.getByLabel('JSON 가져오기', { exact: true }).setInputFiles({ name: 'phase-a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacySave)) });
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await expect(page.getByRole('alert')).toContainText('Phase A 프리뷰 세이브');
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(imported));
  await page.getByLabel('JSON 가져오기', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"bad":true}') });
  await page.getByRole('button', { name: '교체하고 계속' }).click();
  await expect(page.getByRole('alert')).toContainText('지원하지 않는');
  await expect(page.getByTestId('state-hash')).toHaveText(stateHash(imported));
  await page.getByRole('button', { name: '세이브 관리 닫기' }).click();
  // After load, the core game needs no external API and can advance offline.
  await context.setOffline(true);
  await page.getByRole('button', { name: '다음 주로' }).click();
  await page.getByRole('link', { name: '홈', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('2026.10.26');
  expect(errors).toEqual([]);
});

test('C1 monthly reports stay labelled and persist across several months', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('개발 프리뷰입니다. 모든 지지·조사는 가상 시뮬레이션', { exact: false })).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.getByRole('button', { name: '다음 주로' }).click();
    await expect(page.getByRole('status').filter({ hasText: '자동저장 완료' })).toBeVisible();
  }
  await expect(page.getByTestId('game-date')).toHaveText('2027.02.01');
  await page.getByRole('button').filter({ hasText: '월간 사회 이슈 보고' }).first().click();
  await expect(page.locator('.letter-body')).toContainText('게임 모델 지수 (현실 통계 아님)');
  await expect(page.locator('.letter-body')).toContainText('심각도');
  await expect(page.locator('.letter-body')).toContainText('관심도');
  await page.reload();
  await expect(page.getByTestId('game-date')).toHaveText('2027.02.01');
});

test('main-thread fallback and small screens remain functional', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: '다음 주로' }).click();
  await expect(page.getByTestId('game-date')).toHaveText('2026.10.26');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByText('저장 무결성 정보').click();
  await expect(page.getByText('스키마 8 · 엔진 메인 스레드', { exact: false })).toBeVisible();
});

test('C1 policy drafts, publication, issue cards and analysis remain command driven', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/data');
  await expect(page.getByTestId('survey-gate')).toBeVisible();
  await page.getByRole('button', { name: '내부조사 의뢰', exact: true }).click();
  await expect(page.getByTestId('current-support')).toBeVisible();
  const current = await page.getByTestId('current-support').textContent();
  await page.getByRole('link', { name: '정책', exact: false }).click();
  await page.getByRole('button', { name: '산업·AI', exact: true }).click();
  const published = page.getByTestId('published-industry-ai.deregulation');
  await expect(published).toContainText('미공표');
  await page.getByRole('slider', { name: '규제 완화 초안' }).press('End');
  await expect(page.getByRole('status').filter({ hasText: '자동저장 완료' })).toBeVisible();
  await expect(published).toContainText('미공표');
  await page.getByRole('link', { name: '데이터 허브', exact: false }).click();
  await expect(page.getByTestId('current-support')).toHaveText(current!);
  await page.getByRole('link', { name: '정책', exact: false }).click();
  await page.getByRole('button', { name: '산업·AI', exact: true }).click();
  await page.getByRole('button', { name: '규제 완화 공표' }).click();
  await expect(page.getByTestId('published-industry-ai.deregulation')).toContainText('공표 4');
  await page.reload();
  await page.getByRole('button', { name: '산업·AI', exact: true }).click();
  await expect(page.getByTestId('published-industry-ai.deregulation')).toContainText('공표 4');
  await page.getByRole('button', { name: '다음 주로' }).click();
  await expect(page.getByRole('status').filter({ hasText: '자동저장 완료' })).toBeVisible();
  await page.getByRole('link', { name: '대한민국', exact: false }).click();
  await expect(page.getByRole('meter')).toHaveCount(12);
  await page.getByRole('link', { name: '데이터 허브', exact: false }).click();
  await page.getByRole('button', { name: '전국 조사', exact: true }).click();
  await expect(page.getByRole('rowheader', { name: '없음·미정' })).toBeVisible();
  await page.getByRole('button', { name: '공개 권역별', exact: true }).click();
  await expect(page.getByRole('heading', { name: '서울', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
