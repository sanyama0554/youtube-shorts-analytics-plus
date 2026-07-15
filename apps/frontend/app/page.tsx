'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetcher, syncVideos, VideoDto, VideoSummaryDto } from '@/lib/api';
import { SummaryCards } from '@/components/SummaryCards';
import { VideoTable } from '@/components/VideoTable';
import { ViewsOverTimeChart } from '@/components/ViewsOverTimeChart';

export default function DashboardPage() {
  const {
    data: videos,
    error: videosError,
    isLoading: videosLoading,
    mutate: mutateVideos,
  } = useSWR<VideoDto[]>('/api/videos', fetcher);
  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR<VideoSummaryDto>('/api/videos/summary', fetcher);

  async function handleSync() {
    await syncVideos();
    await Promise.all([mutateVideos(), mutateSummary()]);
  }

  if (videosError || summaryError) {
    return (
      <main style={{ padding: 24 }}>
        データの取得に失敗しました。バックエンド（NestJS）が起動しているか確認してください。
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>YouTubeチャンネル分析ダッシュボード</h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Link href="/retention">維持率比較</Link>
          <button onClick={handleSync} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            最新データに更新
          </button>
        </div>
      </div>

      {summaryLoading || !summary ? <p>集計を読み込み中...</p> : <SummaryCards summary={summary} />}

      <section style={{ marginTop: 32 }}>
        <h2>視聴回数の推移</h2>
        {videosLoading || !videos ? <p>読み込み中...</p> : <ViewsOverTimeChart videos={videos} />}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>動画一覧</h2>
        {videosLoading || !videos ? <p>読み込み中...</p> : <VideoTable videos={videos} />}
      </section>
    </main>
  );
}
