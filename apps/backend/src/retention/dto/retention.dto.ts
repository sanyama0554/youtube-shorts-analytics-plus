export interface RetentionPointResponseDto {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
  relativeRetentionPerformance: number;
  fetchedAt: string;
}

export interface RetentionBatchSyncResultDto {
  total: number;
  succeeded: number;
  failed: string[];
}
