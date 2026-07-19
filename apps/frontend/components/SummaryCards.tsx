import { VideoSummaryDto } from '@/lib/api';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ja-JP');
}

export function SummaryCards({ summary }: { summary: VideoSummaryDto }) {
  const cards = [
    { label: '総動画数', value: formatNumber(summary.totalVideos) },
    { label: '総視聴回数', value: formatNumber(summary.totalViewCount) },
    { label: '平均いいね率', value: formatPercent(summary.averageLikeRate) },
    { label: '平均コメント率', value: formatPercent(summary.averageCommentRate) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      {cards.map((card) => (
        <div key={card.label} className="card">
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', letterSpacing: '0.01em' }}>{card.label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 4 }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}
