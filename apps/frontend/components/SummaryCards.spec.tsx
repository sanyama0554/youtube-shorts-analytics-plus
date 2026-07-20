import { render, screen } from '@testing-library/react';
import { SummaryCards } from './SummaryCards';

describe('SummaryCards', () => {
  it('formats numbers and percentages for each card', () => {
    render(
      <SummaryCards
        summary={{
          totalVideos: 18,
          totalViewCount: 123456,
          averageLikeRate: 0.0523,
          averageCommentRate: 0.0102,
          lastFetchedAt: '2026-01-01T00:00:00Z',
        }}
      />,
    );

    expect(screen.getByText('総動画数')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('123,456')).toBeInTheDocument();
    expect(screen.getByText('5.23%')).toBeInTheDocument();
    expect(screen.getByText('1.02%')).toBeInTheDocument();
  });
});
