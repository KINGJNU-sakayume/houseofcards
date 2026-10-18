import { expect, test } from '@playwright/test';
import { createGame, dispatchCommand } from '../../src/engine/simulation/engine';
import { stateHash } from '../../src/engine/simulation/determinism';
import { serializeSave } from '../../src/persistence/codec';
import legacySave from '../fixtures/phase-a-v1.json' with { type: 'json' };

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
  await expect(page.getByRole('heading', { name: '다음 단계에서 열립니다.' })).toBeVisible();
  await page.getByRole('button', { name: '저장 / 불러오기' }).click();
  await page.getByText('저장 무결성 정보').click();
  await expect(page.getByText('스키마 2 · 엔진 Web Worker', { exact: false })).toBeVisible();
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

test('B1 monthly reports stay labelled and persist across several months', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('현재는 B1입니다.', { exact: false })).toBeVisible();
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
  await expect(page.getByText('스키마 2 · 엔진 메인 스레드', { exact: false })).toBeVisible();
});
