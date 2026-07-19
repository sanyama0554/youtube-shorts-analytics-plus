'use client';

import { useMemo, useState } from 'react';
import { VideoDto } from '@/lib/api';

type SortKey = keyof Pick<
  VideoDto,
  'title' | 'privacyStatus' | 'publishedAt' | 'viewCount' | 'likeCount' | 'commentCount' | 'subscribersGained'
>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'タイトル' },
  { key: 'privacyStatus', label: '公開設定' },
  { key: 'publishedAt', label: '公開日時' },
  { key: 'viewCount', label: '視聴回数' },
  { key: 'likeCount', label: 'いいね数' },
  { key: 'commentCount', label: 'コメント数' },
  { key: 'subscribersGained', label: '登録者増加数' },
];
const TAGS_COLUMN_LABEL = 'タグ';

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
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} className="sortable" onClick={() => handleSort(col.key)}>
                {col.label}
                {sortKey === col.key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th>{TAGS_COLUMN_LABEL}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((video) => (
            <tr key={video.id}>
              <td>{video.title}</td>
              <td>{video.privacyStatus}</td>
              <td>{new Date(video.publishedAt).toLocaleString('ja-JP')}</td>
              <td>{video.viewCount.toLocaleString('ja-JP')}</td>
              <td>{video.likeCount.toLocaleString('ja-JP')}</td>
              <td>{video.commentCount.toLocaleString('ja-JP')}</td>
              <td>{video.subscribersGained.toLocaleString('ja-JP')}</td>
              <td>{video.tags.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
