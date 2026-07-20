import { render, screen } from '@testing-library/react';
import { RetentionCompareChart } from './RetentionCompareChart';

describe('RetentionCompareChart', () => {
  it('shows a fallback message when none of the selected videos have retention data yet', () => {
    render(
      <RetentionCompareChart compareData={{ a: [], b: [] }} videoIds={['a', 'b']} videoTitles={{}} metric="audienceWatchRatio" />,
    );

    expect(screen.getByText(/維持率データがまだありません/)).toBeInTheDocument();
  });

  it('renders the chart instead of the fallback once data exists for at least one video', () => {
    render(
      <RetentionCompareChart
        compareData={{
          a: [{ elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.8, relativeRetentionPerformance: 0.9, fetchedAt: '2026-01-01T00:00:00Z' }],
          b: [],
        }}
        videoIds={['a', 'b']}
        videoTitles={{ a: 'Video A' }}
        metric="audienceWatchRatio"
      />,
    );

    expect(screen.queryByText(/維持率データがまだありません/)).not.toBeInTheDocument();
  });
});
