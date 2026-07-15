'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RetentionCompareDto } from '@/lib/api';

const LINE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

export type RetentionMetric = 'audienceWatchRatio' | 'relativeRetentionPerformance';

export function RetentionCompareChart({
  compareData,
  videoIds,
  videoTitles,
  metric,
}: {
  compareData: RetentionCompareDto;
  videoIds: string[];
  videoTitles: Record<string, string>;
  metric: RetentionMetric;
}) {
  const ratios = new Set<number>();
  for (const id of videoIds) {
    for (const point of compareData[id] ?? []) {
      ratios.add(point.elapsedVideoTimeRatio);
    }
  }
  const sortedRatios = Array.from(ratios).sort((a, b) => a - b);

  const data = sortedRatios.map((ratio) => {
    const row: Record<string, number> = { elapsedVideoTimeRatio: ratio };
    for (const id of videoIds) {
      const point = (compareData[id] ?? []).find((p) => p.elapsedVideoTimeRatio === ratio);
      if (point) {
        row[id] = point[metric];
      }
    }
    return row;
  });

  if (sortedRatios.length === 0) {
    return <p>選択した動画の維持率データがまだありません。先にバッチ同期を実行してください。</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="elapsedVideoTimeRatio"
          type="number"
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
        />
        <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
        <Tooltip
          labelFormatter={(v: number) => `再生位置 ${Math.round(v * 100)}%`}
          formatter={(value: number, name: string) => [`${(value * 100).toFixed(1)}%`, videoTitles[name] ?? name]}
        />
        <Legend formatter={(name: string) => videoTitles[name] ?? name} />
        {videoIds.map((id, index) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            stroke={LINE_COLORS[index % LINE_COLORS.length]}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
