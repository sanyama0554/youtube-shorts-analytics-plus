'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, RetentionCompareDto, VideoDto } from '@/lib/api';
import { RetentionCompareChart, RetentionMetric } from '@/components/RetentionCompareChart';
import { RetentionVideoSelector } from '@/components/RetentionVideoSelector';

export default function RetentionPage() {
  const { data: videos, error: videosError, isLoading: videosLoading } = useSWR<VideoDto[]>('/api/videos', fetcher);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [metric, setMetric] = useState<RetentionMetric>('audienceWatchRatio');

  const compareKey =
    selectedVideoIds.length > 0 ? `/api/retention/compare?videoIds=${selectedVideoIds.join(',')}` : null;
  const { data: compareData, error: compareError, isLoading: compareLoading } = useSWR<RetentionCompareDto>(
    compareKey,
    fetcher,
  );

  if (videosError) {
    return (
      <main style={{ padding: 24 }}>
        データの取得に失敗しました。バックエンド（NestJS）が起動しているか確認してください。
      </main>
    );
  }

  const videoTitles = Object.fromEntries((videos ?? []).map((v) => [v.id, v.title]));

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>維持率比較</h1>
        <Link href="/" className="link">
          ダッシュボードに戻る
        </Link>
      </div>

      <section style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <div style={{ width: 280, flexShrink: 0 }}>
          <h2>動画を選択</h2>
          {videosLoading || !videos ? (
            <p>読み込み中...</p>
          ) : (
            <RetentionVideoSelector videos={videos} selectedVideoIds={selectedVideoIds} onChange={setSelectedVideoIds} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ marginRight: 16 }}>
              <input
                type="radio"
                checked={metric === 'audienceWatchRatio'}
                onChange={() => setMetric('audienceWatchRatio')}
              />{' '}
              相対視聴維持率 (audienceWatchRatio)
            </label>
            <label>
              <input
                type="radio"
                checked={metric === 'relativeRetentionPerformance'}
                onChange={() => setMetric('relativeRetentionPerformance')}
              />{' '}
              同カテゴリ動画比較 (relativeRetentionPerformance)
            </label>
          </div>

          {selectedVideoIds.length === 0 ? (
            <p>左のリストから比較したい動画を選択してください。</p>
          ) : compareError ? (
            <p>維持率データの取得に失敗しました。</p>
          ) : compareLoading || !compareData ? (
            <p>読み込み中...</p>
          ) : (
            <RetentionCompareChart
              compareData={compareData}
              videoIds={selectedVideoIds}
              videoTitles={videoTitles}
              metric={metric}
            />
          )}
        </div>
      </section>
    </main>
  );
}
