import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoDto } from '@/lib/api';
import { renderWithFreshSWR } from '../../test-utils/render-with-swr';
import RetentionPage from './page';

function video(id: string, title: string): VideoDto {
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

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
}

describe('RetentionPage', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/retention/compare')) {
        return jsonResponse({
          a: [{ elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.8, relativeRetentionPerformance: 0.9, fetchedAt: '2026-01-01T00:00:00Z' }],
        });
      }
      if (url.endsWith('/api/videos')) return jsonResponse([video('a', 'Video A'), video('b', 'Video B')]);
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('prompts to select a video before any is chosen', async () => {
    renderWithFreshSWR(<RetentionPage />);

    expect(await screen.findByText('Video A')).toBeInTheDocument();
    expect(screen.getByText('左のリストから比較したい動画を選択してください。')).toBeInTheDocument();
  });

  it('fetches and renders the comparison once a video is selected', async () => {
    const user = userEvent.setup();
    renderWithFreshSWR(<RetentionPage />);
    await screen.findByText('Video A');

    await user.click(screen.getByLabelText('Video A'));

    await waitFor(() => {
      expect(screen.queryByText('左のリストから比較したい動画を選択してください。')).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/retention/compare?videoIds=a'));
  });
});
