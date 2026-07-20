import { NotFoundException } from '@nestjs/common';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeAnalyticsApiService } from '../youtube/youtube-analytics-api.service';
import { RetentionService } from './retention.service';

function buildService(
  overrides: {
    prisma?: Record<string, unknown>;
    oauthService?: Record<string, unknown>;
    analyticsApi?: Record<string, unknown>;
  } = {},
) {
  const prisma = {
    video: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    retentionPoint: { upsert: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides.prisma,
  } as unknown as PrismaService;

  const oauthService = {
    getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    ...overrides.oauthService,
  } as unknown as OAuthService;

  const analyticsApi = {
    getAudienceRetention: jest.fn().mockResolvedValue([]),
    ...overrides.analyticsApi,
  } as unknown as YoutubeAnalyticsApiService;

  const service = new RetentionService(prisma, oauthService, analyticsApi);
  return { service, prisma, oauthService, analyticsApi };
}

describe('RetentionService', () => {
  describe('syncVideoRetention', () => {
    it('throws when the video does not exist', async () => {
      const { service } = buildService({ prisma: { video: { findUnique: jest.fn().mockResolvedValue(null) } } });

      await expect(service.syncVideoRetention('missing')).rejects.toThrow(NotFoundException);
    });

    it('fetches retention since the video publish date and upserts every point', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValue({ id: 'video-1', youtubeVideoId: 'yt-1', publishedAt: new Date('2026-02-15T00:00:00Z') });
      const upsert = jest.fn().mockResolvedValue({});
      const transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
      const getAudienceRetention = jest.fn().mockResolvedValue([
        { elapsedVideoTimeRatio: 0.01, audienceWatchRatio: 1.2, relativeRetentionPerformance: 0.5 },
        { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.4, relativeRetentionPerformance: 0.6 },
      ]);
      const { service } = buildService({
        prisma: { video: { findUnique }, retentionPoint: { upsert }, $transaction: transaction },
        analyticsApi: { getAudienceRetention },
      });

      await service.syncVideoRetention('video-1');

      expect(getAudienceRetention).toHaveBeenCalledWith('yt-1', '2026-02-15', 'access-token');
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[0][0].where).toEqual({
        videoId_elapsedVideoTimeRatio: { videoId: 'video-1', elapsedVideoTimeRatio: 0.01 },
      });
    });
  });

  describe('syncAllVideosRetention', () => {
    it('continues past a failing video and reports it in the failed list', async () => {
      jest.useFakeTimers();
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({ id: 'v1', youtubeVideoId: 'yt-1', publishedAt: new Date('2026-01-01T00:00:00Z') })
        .mockResolvedValueOnce({ id: 'v2', youtubeVideoId: 'yt-2', publishedAt: new Date('2026-01-01T00:00:00Z') });
      const findMany = jest.fn().mockResolvedValue([
        { id: 'v1', youtubeVideoId: 'yt-1' },
        { id: 'v2', youtubeVideoId: 'yt-2' },
      ]);
      const getAudienceRetention = jest
        .fn()
        .mockResolvedValueOnce([{ elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 1, relativeRetentionPerformance: 1 }])
        .mockRejectedValueOnce(new Error('quota exceeded'));
      const { service } = buildService({
        prisma: { video: { findUnique, findMany } },
        analyticsApi: { getAudienceRetention },
      });

      const resultPromise = service.syncAllVideosRetention();
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ total: 2, succeeded: 1, failed: ['yt-2'] });
      jest.useRealTimers();
    });
  });

  describe('getRetentionCurve', () => {
    it('maps DB rows to the response DTO, sorted by elapsed ratio', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          elapsedVideoTimeRatio: 0.5,
          audienceWatchRatio: 0.8,
          relativeRetentionPerformance: 0.9,
          fetchedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      const { service } = buildService({ prisma: { retentionPoint: { findMany } } });

      const result = await service.getRetentionCurve('video-1');

      expect(result).toEqual([
        {
          elapsedVideoTimeRatio: 0.5,
          audienceWatchRatio: 0.8,
          relativeRetentionPerformance: 0.9,
          fetchedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      expect(findMany).toHaveBeenCalledWith({
        where: { videoId: 'video-1' },
        orderBy: { elapsedVideoTimeRatio: 'asc' },
      });
    });
  });

  describe('compareRetention', () => {
    it('groups points by videoId and returns an empty array for videos without data', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          videoId: 'v1',
          elapsedVideoTimeRatio: 0.5,
          audienceWatchRatio: 0.8,
          relativeRetentionPerformance: 0.9,
          fetchedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
      const { service } = buildService({ prisma: { retentionPoint: { findMany } } });

      const result = await service.compareRetention(['v1', 'v2']);

      expect(Object.keys(result)).toEqual(['v1', 'v2']);
      expect(result.v1).toHaveLength(1);
      expect(result.v2).toEqual([]);
    });
  });
});
