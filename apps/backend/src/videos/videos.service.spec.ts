import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeApiService } from '../youtube/youtube-api.service';
import { VideosService } from './videos.service';

const CONFIG: Record<string, string | number> = {
  YOUTUBE_CHANNEL_ID: 'UCowner',
  VIDEOS_CACHE_TTL_MINUTES: 60,
};

function buildService(
  overrides: {
    prisma?: Record<string, unknown>;
    youtubeApi?: Record<string, unknown>;
    oauthService?: Record<string, unknown>;
  } = {},
) {
  const configService = {
    getOrThrow: jest.fn((key: string) => CONFIG[key]),
    get: jest.fn((key: string, fallback: unknown) => CONFIG[key] ?? fallback),
  } as unknown as ConfigService;

  const prisma = {
    video: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    channel: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides.prisma,
  } as unknown as PrismaService;

  const youtubeApi = {
    fetchAllVideos: jest.fn().mockResolvedValue([]),
    getUploadsPlaylistId: jest.fn().mockResolvedValue('UUxxx'),
    ...overrides.youtubeApi,
  } as unknown as YoutubeApiService;

  const oauthService = {
    getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    ...overrides.oauthService,
  } as unknown as OAuthService;

  const service = new VideosService(prisma, youtubeApi, oauthService, configService);
  return { service, prisma, youtubeApi, oauthService };
}

function dbVideo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'video-1',
    youtubeVideoId: 'yt-1',
    title: 'title',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    privacyStatus: 'public',
    tags: [],
    viewCount: 100,
    likeCount: 10,
    commentCount: 5,
    subscribersGained: 2,
    lastFetchedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('VideosService', () => {
  describe('getVideos', () => {
    it('does not re-sync when the cache is still fresh', async () => {
      const findFirst = jest.fn().mockResolvedValue({ lastFetchedAt: new Date() });
      const findMany = jest.fn().mockResolvedValue([dbVideo()]);
      const { service, youtubeApi } = buildService({ prisma: { video: { findFirst, findMany } } });

      const result = await service.getVideos();

      expect(youtubeApi.fetchAllVideos).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('re-syncs when there is no cached data yet', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([]);
      const findUniqueChannel = jest.fn().mockResolvedValue({ id: 'channel-1' });
      const { service, youtubeApi } = buildService({
        prisma: { video: { findFirst, findMany }, channel: { findUnique: findUniqueChannel } },
      });

      await service.getVideos();

      expect(youtubeApi.fetchAllVideos).toHaveBeenCalledTimes(1);
    });

    it('re-syncs when the cache has expired past the configured TTL', async () => {
      const staleDate = new Date(Date.now() - 61 * 60 * 1000);
      const findFirst = jest.fn().mockResolvedValue({ lastFetchedAt: staleDate });
      const findMany = jest.fn().mockResolvedValue([]);
      const findUniqueChannel = jest.fn().mockResolvedValue({ id: 'channel-1' });
      const { service, youtubeApi } = buildService({
        prisma: { video: { findFirst, findMany }, channel: { findUnique: findUniqueChannel } },
      });

      await service.getVideos();

      expect(youtubeApi.fetchAllVideos).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSummary', () => {
    it('computes totals and rates, excluding zero-view videos from the rate average', async () => {
      const findMany = jest
        .fn()
        .mockResolvedValue([
          dbVideo({ id: 'v1', viewCount: 100, likeCount: 10, commentCount: 5, lastFetchedAt: new Date('2026-01-02T00:00:00Z') }),
          dbVideo({ id: 'v2', viewCount: 0, likeCount: 0, commentCount: 0, lastFetchedAt: new Date('2026-01-01T00:00:00Z') }),
        ]);
      const { service } = buildService({ prisma: { video: { findMany } } });

      const summary = await service.getSummary();

      expect(summary.totalVideos).toBe(2);
      expect(summary.totalViewCount).toBe(100);
      expect(summary.averageLikeRate).toBeCloseTo(0.1);
      expect(summary.averageCommentRate).toBeCloseTo(0.05);
      expect(summary.lastFetchedAt).toBe(new Date('2026-01-02T00:00:00Z').toISOString());
    });

    it('returns zeroed-out values when there are no videos', async () => {
      const { service } = buildService({ prisma: { video: { findMany: jest.fn().mockResolvedValue([]) } } });

      const summary = await service.getSummary();

      expect(summary).toEqual({
        totalVideos: 0,
        totalViewCount: 0,
        averageLikeRate: 0,
        averageCommentRate: 0,
        lastFetchedAt: null,
      });
    });
  });

  describe('syncFromYoutube', () => {
    it('creates the Channel row on first sync and passes the resolved access token through', async () => {
      const findUniqueChannel = jest.fn().mockResolvedValue(null);
      const create = jest.fn().mockResolvedValue({ id: 'channel-1' });
      const findMany = jest.fn().mockResolvedValue([]);
      const fetchAllVideos = jest.fn().mockResolvedValue([]);
      const { service } = buildService({
        prisma: { channel: { findUnique: findUniqueChannel, create }, video: { findMany } },
        youtubeApi: { fetchAllVideos, getUploadsPlaylistId: jest.fn().mockResolvedValue('UUxxx') },
        oauthService: { getValidAccessToken: jest.fn().mockResolvedValue('owner-token') },
      });

      await service.syncFromYoutube();

      expect(create).toHaveBeenCalledWith({
        data: { youtubeChannelId: 'UCowner', title: 'UCowner', uploadsPlaylistId: 'UUxxx' },
      });
      expect(fetchAllVideos).toHaveBeenCalledWith('UCowner', 'owner-token');
    });

    it('falls back to API-key-only sync when OAuth is not connected', async () => {
      const findUniqueChannel = jest.fn().mockResolvedValue({ id: 'channel-1' });
      const findMany = jest.fn().mockResolvedValue([]);
      const fetchAllVideos = jest.fn().mockResolvedValue([]);
      const { service } = buildService({
        prisma: { channel: { findUnique: findUniqueChannel }, video: { findMany } },
        youtubeApi: { fetchAllVideos },
        oauthService: { getValidAccessToken: jest.fn().mockRejectedValue(new Error('not connected')) },
      });

      await service.syncFromYoutube();

      expect(fetchAllVideos).toHaveBeenCalledWith('UCowner', undefined);
    });

    it('upserts every fetched video inside a single transaction', async () => {
      const findUniqueChannel = jest.fn().mockResolvedValue({ id: 'channel-1' });
      const findMany = jest.fn().mockResolvedValue([]);
      const upsert = jest.fn().mockResolvedValue({});
      const transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
      const fetchAllVideos = jest.fn().mockResolvedValue([
        {
          youtubeVideoId: 'yt-1',
          title: 't1',
          publishedAt: '2026-01-01T00:00:00Z',
          privacyStatus: 'public',
          tags: ['a'],
          viewCount: 1,
          likeCount: 1,
          commentCount: 1,
        },
      ]);
      const { service } = buildService({
        prisma: { channel: { findUnique: findUniqueChannel }, video: { findMany, upsert }, $transaction: transaction },
        youtubeApi: { fetchAllVideos },
      });

      await service.syncFromYoutube();

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0][0].where).toEqual({ youtubeVideoId: 'yt-1' });
    });
  });
});
