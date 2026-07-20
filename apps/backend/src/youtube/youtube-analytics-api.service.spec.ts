import { HttpService } from '@nestjs/axios';
import type { AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { YoutubeAnalyticsApiService } from './youtube-analytics-api.service';

function buildService(getMock: jest.Mock) {
  const httpService = { get: getMock } as unknown as HttpService;
  return new YoutubeAnalyticsApiService(httpService);
}

describe('YoutubeAnalyticsApiService', () => {
  describe('getAudienceRetention', () => {
    it('maps rows in [ratio, watchRatio, relativePerformance] order', async () => {
      const get = jest.fn().mockReturnValue(
        of({
          data: {
            rows: [
              [0.01, 1.5, 0.7],
              [1, 0.6, 0.9],
            ],
          },
        } as unknown as AxiosResponse),
      );
      const service = buildService(get);

      const result = await service.getAudienceRetention('videoId1', '2026-01-01', 'access-token');

      expect(result).toEqual([
        { elapsedVideoTimeRatio: 0.01, audienceWatchRatio: 1.5, relativeRetentionPerformance: 0.7 },
        { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.6, relativeRetentionPerformance: 0.9 },
      ]);
      const [, config] = get.mock.calls[0];
      expect(config.params).toMatchObject({
        ids: 'channel==MINE',
        startDate: '2026-01-01',
        metrics: 'audienceWatchRatio,relativeRetentionPerformance',
        dimensions: 'elapsedVideoTimeRatio',
        filters: 'video==videoId1',
      });
      expect(config.headers).toEqual({ Authorization: 'Bearer access-token' });
    });

    it('returns an empty array when there are no rows yet', async () => {
      const get = jest.fn().mockReturnValue(of({ data: {} } as unknown as AxiosResponse));
      const service = buildService(get);

      const result = await service.getAudienceRetention('videoId1', '2026-01-01', 'access-token');

      expect(result).toEqual([]);
    });
  });

  describe('getSubscribersGained', () => {
    it('returns the single aggregate value with no dimension breakdown', async () => {
      const get = jest.fn().mockReturnValue(of({ data: { rows: [[7]] } } as unknown as AxiosResponse));
      const service = buildService(get);

      const result = await service.getSubscribersGained('videoId1', '2026-01-01', 'access-token');

      expect(result).toBe(7);
      const [, config] = get.mock.calls[0];
      expect(config.params.metrics).toBe('subscribersGained');
      expect(config.params.dimensions).toBeUndefined();
    });

    it('returns 0 when there is no data yet', async () => {
      const get = jest.fn().mockReturnValue(of({ data: { rows: [] } } as unknown as AxiosResponse));
      const service = buildService(get);

      const result = await service.getSubscribersGained('videoId1', '2026-01-01', 'access-token');

      expect(result).toBe(0);
    });
  });
});
