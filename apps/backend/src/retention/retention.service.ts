import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetentionBatchSyncResultDto, RetentionPointResponseDto } from './dto/retention.dto';
import { YoutubeAnalyticsApiService } from './youtube-analytics-api.service';

// 維持率バッチは動画数に比例してクォータを消費するため、リクエスト間に待機を入れてレート制御する
const BATCH_REQUEST_DELAY_MS = 500;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: OAuthService,
    private readonly analyticsApi: YoutubeAnalyticsApiService,
  ) {}

  async syncVideoRetention(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }

    const accessToken = await this.oauthService.getValidAccessToken();
    const startDate = video.publishedAt.toISOString().slice(0, 10);
    const points = await this.analyticsApi.getAudienceRetention(video.youtubeVideoId, startDate, accessToken);

    await this.prisma.$transaction(
      points.map((p) =>
        this.prisma.retentionPoint.upsert({
          where: {
            videoId_elapsedVideoTimeRatio: { videoId: video.id, elapsedVideoTimeRatio: p.elapsedVideoTimeRatio },
          },
          create: {
            videoId: video.id,
            elapsedVideoTimeRatio: p.elapsedVideoTimeRatio,
            audienceWatchRatio: p.audienceWatchRatio,
            relativeRetentionPerformance: p.relativeRetentionPerformance,
          },
          update: {
            audienceWatchRatio: p.audienceWatchRatio,
            relativeRetentionPerformance: p.relativeRetentionPerformance,
          },
        }),
      ),
    );
  }

  async syncAllVideosRetention(): Promise<RetentionBatchSyncResultDto> {
    const videos = await this.prisma.video.findMany({ select: { id: true, youtubeVideoId: true } });
    let succeeded = 0;
    const failed: string[] = [];

    for (const [index, video] of videos.entries()) {
      try {
        await this.syncVideoRetention(video.id);
        succeeded += 1;
        this.logger.log(`retention synced: ${video.youtubeVideoId} (${index + 1}/${videos.length})`);
      } catch (error) {
        failed.push(video.youtubeVideoId);
        this.logger.error(
          `retention sync failed for ${video.youtubeVideoId} (${index + 1}/${videos.length}): ${(error as Error).message}`,
        );
      }

      if (index < videos.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_REQUEST_DELAY_MS));
      }
    }

    return { total: videos.length, succeeded, failed };
  }

  async getRetentionCurve(videoId: string): Promise<RetentionPointResponseDto[]> {
    const points = await this.prisma.retentionPoint.findMany({
      where: { videoId },
      orderBy: { elapsedVideoTimeRatio: 'asc' },
    });
    return points.map(toRetentionPointDto);
  }

  async compareRetention(videoIds: string[]): Promise<Record<string, RetentionPointResponseDto[]>> {
    const points = await this.prisma.retentionPoint.findMany({
      where: { videoId: { in: videoIds } },
      orderBy: { elapsedVideoTimeRatio: 'asc' },
    });

    const grouped: Record<string, RetentionPointResponseDto[]> = {};
    for (const id of videoIds) {
      grouped[id] = [];
    }
    for (const point of points) {
      grouped[point.videoId].push(toRetentionPointDto(point));
    }
    return grouped;
  }
}

function toRetentionPointDto(point: {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
  relativeRetentionPerformance: number;
  fetchedAt: Date;
}): RetentionPointResponseDto {
  return {
    elapsedVideoTimeRatio: point.elapsedVideoTimeRatio,
    audienceWatchRatio: point.audienceWatchRatio,
    relativeRetentionPerformance: point.relativeRetentionPerformance,
    fetchedAt: point.fetchedAt.toISOString(),
  };
}
