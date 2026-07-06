'use client';

import { useMemo, useState } from 'react';
import { VideoDto } from '@/lib/api';

type SortKey = keyof Pick<
  VideoDto,
  'title' | 'privacyStatus' | 'publishedAt' | 'viewCount' | 'likeCount' | 'commentCount'
>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'タイトル' },
  { key: 'privacyStatus', label: '公開設定' },
  { key: 'publishedAt', label: '公開日時' },
  { key: 'viewCount', label: '視聴回数' },
  { key: 'likeCount', label: 'いいね数' },
  { key: 'commentCount', label: 'コメント数' },
];

export function VideoTable({ videos }: { videos: VideoDto[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('publishedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...videos];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const compared =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortOrder === 'asc' ? compared : -compared;
    });
    return copy;
  }, [videos, sortKey, sortOrder]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
      <thead>
        <tr>
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              onClick={() => handleSort(col.key)}
              style={{ cursor: 'pointer', textAlign: 'left', borderBottom: '2px solid #ddd', padding: 8 }}
            >
              {col.label}
              {sortKey === col.key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((video) => (
          <tr key={video.id}>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{video.title}</td>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{video.privacyStatus}</td>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
              {new Date(video.publishedAt).toLocaleString('ja-JP')}
            </td>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{video.viewCount.toLocaleString('ja-JP')}</td>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{video.likeCount.toLocaleString('ja-JP')}</td>
            <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
              {video.commentCount.toLocaleString('ja-JP')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
