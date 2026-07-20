import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:4000';

function video(id: string, title: string) {
  return {
    id,
    youtubeVideoId: `yt-${id}`,
    title,
    publishedAt: '2026-01-01T00:00:00Z',
    privacyStatus: 'public',
    tags: [],
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    subscribersGained: 0,
    lastFetchedAt: '2026-01-01T00:00:00Z',
  };
}

test.describe('維持率比較ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE}/api/videos`, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({ json: [video('a', 'Video A'), video('b', 'Video B')] });
    });
  });

  test('動画未選択時は案内文が表示される', async ({ page }) => {
    await page.goto('/retention');

    await expect(page.getByText('Video A')).toBeVisible();
    await expect(page.getByText('左のリストから比較したい動画を選択してください。')).toBeVisible();
  });

  test('動画を選択すると比較データを取得しグラフが表示される', async ({ page }) => {
    let requestedUrl = '';
    await page.route(`${API_BASE}/api/retention/compare**`, (route) => {
      requestedUrl = route.request().url();
      return route.fulfill({
        json: {
          a: [
            { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.8, relativeRetentionPerformance: 0.9, fetchedAt: '2026-01-01T00:00:00Z' },
          ],
        },
      });
    });

    await page.goto('/retention');
    await page.getByLabel('Video A').check();

    await expect(page.getByText('左のリストから比較したい動画を選択してください。')).not.toBeVisible();
    await expect.poll(() => requestedUrl).toContain('videoIds=a');
  });

  test('データが無い動画のみ選択した場合はフォールバック文言が表示される', async ({ page }) => {
    await page.route(`${API_BASE}/api/retention/compare**`, (route) => route.fulfill({ json: { a: [] } }));

    await page.goto('/retention');
    await page.getByLabel('Video A').check();

    await expect(page.getByText('選択した動画の維持率データがまだありません')).toBeVisible();
  });

  test('ダッシュボードへ戻るリンクで/へ遷移する', async ({ page }) => {
    await page.route(`${API_BASE}/api/videos/summary`, (route) =>
      route.fulfill({ json: { totalVideos: 0, totalViewCount: 0, averageLikeRate: 0, averageCommentRate: 0, lastFetchedAt: null } }),
    );
    await page.goto('/retention');

    await page.getByRole('link', { name: 'ダッシュボードに戻る' }).click();

    await expect(page).toHaveURL('/');
  });
});
