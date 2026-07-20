import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoDto } from '@/lib/api';
import { VideoTable } from './VideoTable';

function video(overrides: Partial<VideoDto>): VideoDto {
  return {
    id: overrides.id ?? 'v1',
    youtubeVideoId: 'yt-1',
    title: 'title',
    publishedAt: '2026-01-01T00:00:00Z',
    privacyStatus: 'public',
    tags: [],
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    subscribersGained: 0,
    lastFetchedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function rowTitles() {
  const rows = screen.getAllByRole('row').slice(1); // 先頭はヘッダー行
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent);
}

describe('VideoTable', () => {
  const videos = [
    video({ id: 'a', title: 'Aaa', viewCount: 30, publishedAt: '2026-01-01T00:00:00Z' }),
    video({ id: 'b', title: 'Bbb', viewCount: 10, publishedAt: '2026-03-01T00:00:00Z' }),
    video({ id: 'c', title: 'Ccc', viewCount: 20, publishedAt: '2026-02-01T00:00:00Z' }),
  ];

  it('sorts by publishedAt descending by default', () => {
    render(<VideoTable videos={videos} />);
    expect(rowTitles()).toEqual(['Bbb', 'Ccc', 'Aaa']);
  });

  it('toggles sort order when the same column header is clicked twice', async () => {
    const user = userEvent.setup();
    render(<VideoTable videos={videos} />);

    await user.click(screen.getByRole('columnheader', { name: /視聴回数/ }));
    expect(rowTitles()).toEqual(['Aaa', 'Ccc', 'Bbb']); // 30, 20, 10 desc

    await user.click(screen.getByRole('columnheader', { name: /視聴回数/ }));
    expect(rowTitles()).toEqual(['Bbb', 'Ccc', 'Aaa']); // 10, 20, 30 asc
  });

  it('switches to descending order when a new column is clicked', async () => {
    const user = userEvent.setup();
    render(<VideoTable videos={videos} />);

    await user.click(screen.getByRole('columnheader', { name: /タイトル/ }));
    expect(rowTitles()).toEqual(['Ccc', 'Bbb', 'Aaa']);
  });
});
