import { NotFoundException } from '@nestjs/common';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeAnalyticsApiService } from '../youtube/youtube-analytics-api.service';
import { SubscribersService } from './subscribers.service';

function buildService(
  overrides: {
    prisma?: Record<string, unknown>;
    oauthService?: Record<string, unknown>;
    analyticsApi?: Record<string, unknown>;
  } = {},
) {
  const prisma = {
    video: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    ...overrides.prisma,
  } as unknown as PrismaService;

  const oauthService = {
    getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
    ...overrides.oauthService,
  } as unknown as OAuthService;

  const analyticsApi = {
    getSubscribersGained: jest.fn().mockResolvedValue(0),
    ...overrides.analyticsApi,
  } as unknown as YoutubeAnalyticsApiService;

  const service = new SubscribersService(prisma, oauthService, analyticsApi);
  return { service, prisma, oauthService, analyticsApi };
}

describe('SubscribersService', () => {
  describe('syncVideoSubscribersGained', () => {
    it('throws when the video does not exist', async () => {
      const { service } = buildService({ prisma: { video: { findUnique: jest.fn().mockResolvedValue(null) } } });

      await expect(service.syncVideoSubscribersGained('missing')).rejects.toThrow(NotFoundException);
    });

    it('writes the fetched total back onto the Video row', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValue({ id: 'video-1', youtubeVideoId: 'yt-1', publishedAt: new Date('2026-03-10T00:00:00Z') });
      const update = jest.fn().mockResolvedValue({});
      const getSubscribersGained = jest.fn().mockResolvedValue(12);
      const { service } = buildService({
        prisma: { video: { findUnique, update } },
        analyticsApi: { getSubscribersGained },
      });

      await service.syncVideoSubscribersGained('video-1');

      expect(getSubscribersGained).toHaveBeenCalledWith('yt-1', '2026-03-10', 'access-token');
      expect(update).toHaveBeenCalledWith({ where: { id: 'video-1' }, data: { subscribersGained: 12 } });
    });
  });

  describe('syncAllVideosSubscribersGained', () => {
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
      const getSubscribersGained = jest.fn().mockResolvedValueOnce(3).mockRejectedValueOnce(new Error('quota exceeded'));
      const { service } = buildService({
        prisma: { video: { findUnique, findMany, update: jest.fn().mockResolvedValue({}) } },
        analyticsApi: { getSubscribersGained },
      });

      const resultPromise = service.syncAllVideosSubscribersGained();
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ total: 2, succeeded: 1, failed: ['yt-2'] });
      jest.useRealTimers();
    });
  });
});
