import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoDto } from '@/lib/api';
import { RetentionVideoSelector } from './RetentionVideoSelector';

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

describe('RetentionVideoSelector', () => {
  const videos = [video('a', 'Video A'), video('b', 'Video B')];

  it('adds a video id when its checkbox is checked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<RetentionVideoSelector videos={videos} selectedVideoIds={[]} onChange={onChange} />);

    await user.click(screen.getByLabelText('Video A'));

    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('removes a video id when an already-checked checkbox is unchecked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<RetentionVideoSelector videos={videos} selectedVideoIds={['a', 'b']} onChange={onChange} />);

    await user.click(screen.getByLabelText('Video A'));

    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('reflects selectedVideoIds in the checked state', () => {
    render(<RetentionVideoSelector videos={videos} selectedVideoIds={['b']} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Video A')).not.toBeChecked();
    expect(screen.getByLabelText('Video B')).toBeChecked();
  });
});
