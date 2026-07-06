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
        <div key={card.label} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff' }}>
          <div style={{ fontSize: 12, color: '#666' }}>{card.label}</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}
