'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { VideoDto } from '@/lib/api';

export function ViewsOverTimeChart({ videos }: { videos: VideoDto[] }) {
  const data = videos
    .map((v) => ({
      publishedAtTs: new Date(v.publishedAt).getTime(),
      viewCount: v.viewCount,
      title: v.title,
    }))
    .sort((a, b) => a.publishedAtTs - b.publishedAtTs);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="publishedAtTs"
          type="number"
          domain={['auto', 'auto']}
          tickFormatter={(ts: number) => new Date(ts).toLocaleDateString('ja-JP')}
        />
        <YAxis />
        <Tooltip
          labelFormatter={(ts: number) => new Date(ts).toLocaleString('ja-JP')}
          formatter={(value: number) => [value.toLocaleString('ja-JP'), '視聴回数']}
        />
        <Line type="monotone" dataKey="viewCount" stroke="#3b82f6" dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
