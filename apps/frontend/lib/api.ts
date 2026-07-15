export interface VideoDto {
  id: string;
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  privacyStatus: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  lastFetchedAt: string;
}

export interface RetentionPointDto {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
  relativeRetentionPerformance: number;
  fetchedAt: string;
}

export type RetentionCompareDto = Record<string, RetentionPointDto[]>;

export interface VideoSummaryDto {
  totalVideos: number;
  totalViewCount: number;
  averageLikeRate: number;
  averageCommentRate: number;
  lastFetchedAt: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function syncVideos(): Promise<VideoDto[]> {
  const res = await fetch(`${API_BASE_URL}/api/videos/sync`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Sync request failed: ${res.status}`);
  }
  return res.json() as Promise<VideoDto[]>;
}
