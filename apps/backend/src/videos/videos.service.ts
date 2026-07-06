import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeApiService } from '../youtube/youtube-api.service';
import { VideoResponseDto, VideoSummaryResponseDto } from './dto/video.dto';

@Injectable()
export class VideosService {
  private readonly channelId: string;
  private readonly cacheTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeApi: YoutubeApiService,
    private readonly configService: ConfigService,
  ) {
    this.channelId = this.configService.getOrThrow<string>('YOUTUBE_CHANNEL_ID');
    this.cacheTtlMinutes = this.configService.get<number>('VIDEOS_CACHE_TTL_MINUTES', 60);
  }

  async getVideos(): Promise<VideoResponseDto[]> {
    if (await this.isCacheStale()) {
      await this.syncFromYoutube();
    }
    return this.readVideosFromDb();
  }

  async getSummary(): Promise<VideoSummaryResponseDto> {
    const videos = await this.readVideosFromDb();
    return this.buildSummary(videos);
  }

  async syncFromYoutube(): Promise<VideoResponseDto[]> {
    const channel = await this.ensureChannel();
    const fetched = await this.youtubeApi.fetchAllVideos(this.channelId);

    await this.prisma.$transaction(
      fetched.map((v) =>
        this.prisma.video.upsert({
          where: { youtubeVideoId: v.youtubeVideoId },
          create: {
            youtubeVideoId: v.youtubeVideoId,
            channelId: channel.id,
            title: v.title,
            publishedAt: new Date(v.publishedAt),
            privacyStatus: v.privacyStatus,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
          },
          update: {
            title: v.title,
            publishedAt: new Date(v.publishedAt),
            privacyStatus: v.privacyStatus,
            viewCount: v.viewCount,
            likeCount: v.likeCount,
            commentCount: v.commentCount,
            lastFetchedAt: new Date(),
          },
        }),
      ),
    );

    return this.readVideosFromDb();
  }

  private async ensureChannel() {
    const existing = await this.prisma.channel.findUnique({
      where: { youtubeChannelId: this.channelId },
    });
    if (existing) return existing;

    const uploadsPlaylistId = await this.youtubeApi.getUploadsPlaylistId(this.channelId);
    return this.prisma.channel.create({
      data: {
        youtubeChannelId: this.channelId,
        title: this.channelId,
        uploadsPlaylistId,
      },
    });
  }

  private async isCacheStale(): Promise<boolean> {
    const latest = await this.prisma.video.findFirst({
      orderBy: { lastFetchedAt: 'desc' },
      select: { lastFetchedAt: true },
    });
    if (!latest) return true;

    const ageMinutes = (Date.now() - latest.lastFetchedAt.getTime()) / 60_000;
    return ageMinutes > this.cacheTtlMinutes;
  }

  private async readVideosFromDb(): Promise<VideoResponseDto[]> {
    const videos = await this.prisma.video.findMany({ orderBy: { publishedAt: 'desc' } });
    return videos.map((v) => ({
      id: v.id,
      youtubeVideoId: v.youtubeVideoId,
      title: v.title,
      publishedAt: v.publishedAt.toISOString(),
      privacyStatus: v.privacyStatus,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      lastFetchedAt: v.lastFetchedAt.toISOString(),
    }));
  }

  private buildSummary(videos: VideoResponseDto[]): VideoSummaryResponseDto {
    if (videos.length === 0) {
      return {
        totalVideos: 0,
        totalViewCount: 0,
        averageLikeRate: 0,
        averageCommentRate: 0,
        lastFetchedAt: null,
      };
    }

    const average = (nums: number[]) => (nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length);

    const videosWithViews = videos.filter((v) => v.viewCount > 0);
    const totalViewCount = videos.reduce((sum, v) => sum + v.viewCount, 0);
    const averageLikeRate = average(videosWithViews.map((v) => v.likeCount / v.viewCount));
    const averageCommentRate = average(videosWithViews.map((v) => v.commentCount / v.viewCount));
    const lastFetchedAt = videos.reduce<string | null>(
      (latest, v) => (!latest || v.lastFetchedAt > latest ? v.lastFetchedAt : latest),
      null,
    );

    return {
      totalVideos: videos.length,
      totalViewCount,
      averageLikeRate,
      averageCommentRate,
      lastFetchedAt,
    };
  }
}
