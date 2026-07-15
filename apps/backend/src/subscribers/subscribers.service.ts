import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeAnalyticsApiService } from '../youtube/youtube-analytics-api.service';

// 維持率バッチと同様、動画数に比例してクォータを消費するためレート制御する
const BATCH_REQUEST_DELAY_MS = 500;

export interface SubscribersBatchSyncResultDto {
  total: number;
  succeeded: number;
  failed: string[];
}

@Injectable()
export class SubscribersService {
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: OAuthService,
    private readonly analyticsApi: YoutubeAnalyticsApiService,
  ) {}

  async syncVideoSubscribersGained(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }

    const accessToken = await this.oauthService.getValidAccessToken();
    const startDate = video.publishedAt.toISOString().slice(0, 10);
    const subscribersGained = await this.analyticsApi.getSubscribersGained(
      video.youtubeVideoId,
      startDate,
      accessToken,
    );

    await this.prisma.video.update({
      where: { id: video.id },
      data: { subscribersGained },
    });
  }

  async syncAllVideosSubscribersGained(): Promise<SubscribersBatchSyncResultDto> {
    const videos = await this.prisma.video.findMany({ select: { id: true, youtubeVideoId: true } });
    let succeeded = 0;
    const failed: string[] = [];

    for (const [index, video] of videos.entries()) {
      try {
        await this.syncVideoSubscribersGained(video.id);
        succeeded += 1;
        this.logger.log(`subscribers-gained synced: ${video.youtubeVideoId} (${index + 1}/${videos.length})`);
      } catch (error) {
        failed.push(video.youtubeVideoId);
        this.logger.error(
          `subscribers-gained sync failed for ${video.youtubeVideoId} (${index + 1}/${videos.length}): ${(error as Error).message}`,
        );
      }

      if (index < videos.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_REQUEST_DELAY_MS));
      }
    }

    return { total: videos.length, succeeded, failed };
  }
}
