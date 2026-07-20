'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, syncSubscribersGained, syncVideos, VideoDto, VideoSummaryDto } from '@/lib/api';
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

  const [isSyncingSubscribers, setIsSyncingSubscribers] = useState(false);
  const [subscribersSyncMessage, setSubscribersSyncMessage] = useState<string | null>(null);

  async function handleSync() {
    await syncVideos();
    await Promise.all([mutateVideos(), mutateSummary()]);
  }

  async function handleSyncSubscribers() {
    setIsSyncingSubscribers(true);
    setSubscribersSyncMessage(null);
    try {
      const result = await syncSubscribersGained();
      setSubscribersSyncMessage(`${result.succeeded}/${result.total}件の登録者増加数を更新しました`);
      await mutateVideos();
    } catch {
      setSubscribersSyncMessage('登録者増加数の同期に失敗しました');
    } finally {
      setIsSyncingSubscribers(false);
    }
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
          <Link href="/retention" className="link">
            維持率比較
          </Link>
          <button onClick={handleSync} className="btn">
            最新データに更新
          </button>
          <button onClick={handleSyncSubscribers} disabled={isSyncingSubscribers} className="btn">
            {isSyncingSubscribers ? '登録者増加数を同期中...' : '登録者増加数を同期'}
          </button>
        </div>
      </div>

      {subscribersSyncMessage && (
        <p
          className={`status-message ${subscribersSyncMessage.includes('失敗') ? 'status-message--error' : 'status-message--success'}`}
        >
          {subscribersSyncMessage}
        </p>
      )}

      {summaryLoading || !summary ? (
        <p>集計を読み込み中...</p>
      ) : (
        <>
          <SummaryCards summary={summary} />
          {summary.lastFetchedAt && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
              最終取得日時: {new Date(summary.lastFetchedAt).toLocaleString('ja-JP')}
              {'（YouTube APIの取得に失敗した場合、この時点のキャッシュを表示しています）'}
            </p>
          )}
        </>
      )}

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
