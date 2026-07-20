import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:4000';

function video(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'v1',
    youtubeVideoId: 'yt-1',
    title: '動画タイトル',
    publishedAt: '2026-01-01T00:00:00Z',
    privacyStatus: 'public',
    tags: ['rpg'],
    viewCount: 100,
    likeCount: 10,
    commentCount: 2,
    subscribersGained: 3,
    lastFetchedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SUMMARY = {
  totalVideos: 1,
  totalViewCount: 100,
  averageLikeRate: 0.1,
  averageCommentRate: 0.02,
  lastFetchedAt: '2026-01-01T00:00:00Z',
};

test.describe('ダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE}/api/videos/summary`, (route) => route.fulfill({ json: SUMMARY }));
    await page.route(`${API_BASE}/api/videos`, (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [video()] });
      return route.continue();
    });
  });

  test('動画一覧・集計サマリが表示される', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('動画タイトル')).toBeVisible();
    await expect(page.getByText('総動画数')).toBeVisible();
    await expect(page.getByRole('cell', { name: '3', exact: true })).toBeVisible();
    await expect(page.getByText('最終取得日時')).toBeVisible();
  });

  test('列見出しクリックで一覧テーブルの並び替えができる', async ({ page }) => {
    await page.route(`${API_BASE}/api/videos`, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        json: [
          video({ id: 'a', title: '低い動画', viewCount: 10, publishedAt: '2026-01-01T00:00:00Z' }),
          video({ id: 'b', title: '高い動画', viewCount: 90, publishedAt: '2026-02-01T00:00:00Z' }),
        ],
      });
    });
    await page.goto('/');
    await expect(page.getByText('高い動画')).toBeVisible();

    const firstCellBefore = page.locator('tbody tr').first().locator('td').first();
    await expect(firstCellBefore).toHaveText('高い動画'); // 公開日時desc(デフォルト)、bの方が新しい

    await page.getByRole('columnheader', { name: '視聴回数' }).click();
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('高い動画'); // 90,10 desc

    await page.getByRole('columnheader', { name: '視聴回数' }).click();
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('低い動画'); // 10,90 asc
  });

  test('「最新データに更新」で動画一覧が再取得される', async ({ page }) => {
    let synced = false;
    await page.route(`${API_BASE}/api/videos/sync`, (route) => {
      synced = true;
      return route.fulfill({ json: [video({ title: '更新後タイトル' })] });
    });
    await page.route(`${API_BASE}/api/videos`, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({ json: [video({ title: synced ? '更新後タイトル' : '動画タイトル' })] });
    });

    await page.goto('/');
    await expect(page.getByText('動画タイトル')).toBeVisible();

    await page.getByRole('button', { name: '最新データに更新' }).click();

    await expect(page.getByText('更新後タイトル')).toBeVisible();
  });

  test('「登録者増加数を同期」で結果メッセージが表示される', async ({ page }) => {
    await page.route(`${API_BASE}/api/sync/batch/subscribers`, (route) =>
      route.fulfill({ json: { total: 4, succeeded: 4, failed: [] } }),
    );

    await page.goto('/');
    await expect(page.getByText('動画タイトル')).toBeVisible();

    await page.getByRole('button', { name: '登録者増加数を同期' }).click();

    await expect(page.getByText('4/4件の登録者増加数を更新しました')).toBeVisible();
  });

  test('API失敗時にエラーメッセージが表示される', async ({ page }) => {
    await page.route(`${API_BASE}/api/videos`, (route) => route.fulfill({ status: 500, json: {} }));

    await page.goto('/');

    await expect(page.getByText('データの取得に失敗しました')).toBeVisible();
  });
});
