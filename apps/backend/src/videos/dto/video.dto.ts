export interface VideoResponseDto {
  id: string;
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  privacyStatus: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  lastFetchedAt: string;
}

export interface VideoSummaryResponseDto {
  totalVideos: number;
  totalViewCount: number;
  averageLikeRate: number;
  averageCommentRate: number;
  lastFetchedAt: string | null;
}
