import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoDto, VideoSummaryDto } from '@/lib/api';
import { renderWithFreshSWR } from '../test-utils/render-with-swr';
import DashboardPage from './page';

function video(overrides: Partial<VideoDto> = {}): VideoDto {
  return {
    id: 'v1',
    youtubeVideoId: 'yt-1',
    title: '動画タイトル',
    publishedAt: '2026-01-01T00:00:00Z',
    privacyStatus: 'public',
    tags: [],
    viewCount: 100,
    likeCount: 10,
    commentCount: 2,
    subscribersGained: 3,
    lastFetchedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SUMMARY: VideoSummaryDto = {
  totalVideos: 1,
  totalViewCount: 100,
  averageLikeRate: 0.1,
  averageCommentRate: 0.02,
  lastFetchedAt: '2026-01-01T00:00:00Z',
};

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
}

describe('DashboardPage', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/videos/summary')) return jsonResponse(SUMMARY);
      if (url.endsWith('/api/videos')) return jsonResponse([video()]);
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('shows the summary cards and video table once data loads', async () => {
    renderWithFreshSWR(<DashboardPage />);

    expect(await screen.findByText('動画タイトル')).toBeInTheDocument();
    expect(screen.getByText('総動画数')).toBeInTheDocument();
  });

  it('shows the last-fetched-at timestamp alongside the summary (cache freshness indicator)', async () => {
    renderWithFreshSWR(<DashboardPage />);

    expect(await screen.findByText(/最終取得日時/)).toBeInTheDocument();
  });

  it('shows an error message when the initial fetch fails', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response));
    renderWithFreshSWR(<DashboardPage />);

    expect(await screen.findByText(/データの取得に失敗しました/)).toBeInTheDocument();
  });

  it('re-fetches videos after clicking "最新データに更新"', async () => {
    const user = userEvent.setup();
    let currentVideos = [video()];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/videos/sync') && init?.method === 'POST') {
        currentVideos = [video({ title: '更新後タイトル' })];
        return jsonResponse(currentVideos);
      }
      if (url.endsWith('/api/videos/summary')) return jsonResponse(SUMMARY);
      if (url.endsWith('/api/videos')) return jsonResponse(currentVideos);
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderWithFreshSWR(<DashboardPage />);
    await screen.findByText('動画タイトル');

    await user.click(screen.getByRole('button', { name: '最新データに更新' }));

    expect(await screen.findByText('更新後タイトル')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/videos/sync'), { method: 'POST' });
  });

  it('shows a success message after syncing subscribers-gained', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/sync/batch/subscribers') && init?.method === 'POST') {
        return jsonResponse({ total: 5, succeeded: 5, failed: [] });
      }
      if (url.endsWith('/api/videos/summary')) return jsonResponse(SUMMARY);
      if (url.endsWith('/api/videos')) return jsonResponse([video()]);
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    renderWithFreshSWR(<DashboardPage />);
    await screen.findByText('動画タイトル');

    await user.click(screen.getByRole('button', { name: '登録者増加数を同期' }));

    expect(await screen.findByText('5/5件の登録者増加数を更新しました')).toBeInTheDocument();
  });
});
