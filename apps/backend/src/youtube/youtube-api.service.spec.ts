import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { YoutubeApiService } from './youtube-api.service';

function buildService(getMock: jest.Mock) {
  const httpService = { get: getMock } as unknown as HttpService;
  const configService = { getOrThrow: jest.fn().mockReturnValue('test-api-key') } as unknown as ConfigService;
  return new YoutubeApiService(httpService, configService);
}

function axiosOf<T>(data: T) {
  return of({ data } as unknown as AxiosResponse<T>);
}

describe('YoutubeApiService', () => {
  describe('getUploadsPlaylistId', () => {
    it('returns the uploads playlist id', async () => {
      const get = jest
        .fn()
        .mockReturnValue(axiosOf({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUxxx' } } }] }));
      const service = buildService(get);

      const result = await service.getUploadsPlaylistId('UCabc');

      expect(result).toBe('UUxxx');
      const [, params] = get.mock.calls[0];
      expect(params.params).toMatchObject({ part: 'contentDetails', id: 'UCabc', key: 'test-api-key' });
    });

    it('throws when the channel has no uploads playlist', async () => {
      const get = jest.fn().mockReturnValue(axiosOf({ items: [] }));
      const service = buildService(get);

      await expect(service.getUploadsPlaylistId('UCabc')).rejects.toThrow('uploads playlist not found');
    });
  });

  describe('listAllVideoIds', () => {
    it('follows nextPageToken until pagination ends', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(axiosOf({ items: [{ contentDetails: { videoId: 'v1' } }], nextPageToken: 'page2' }))
        .mockReturnValueOnce(axiosOf({ items: [{ contentDetails: { videoId: 'v2' } }] }));
      const service = buildService(get);

      const result = await service.listAllVideoIds('UUxxx');

      expect(result).toEqual(['v1', 'v2']);
      expect(get).toHaveBeenCalledTimes(2);
      expect(get.mock.calls[1][1].params.pageToken).toBe('page2');
    });
  });

  describe('getVideoDetails', () => {
    function videoItem(id: string, tags?: string[]) {
      return {
        id,
        snippet: { title: `title-${id}`, publishedAt: '2026-01-01T00:00:00Z', tags },
        status: { privacyStatus: 'public' },
        statistics: { viewCount: '10', likeCount: '2', commentCount: '1' },
      };
    }

    it('chunks requests into batches of 50 video ids', async () => {
      const videoIds = Array.from({ length: 120 }, (_, i) => `v${i}`);
      const get = jest.fn().mockReturnValue(axiosOf({ items: [] }));
      const service = buildService(get);

      await service.getVideoDetails(videoIds);

      expect(get).toHaveBeenCalledTimes(3);
      expect(get.mock.calls[0][1].params.id.split(',')).toHaveLength(50);
      expect(get.mock.calls[2][1].params.id.split(',')).toHaveLength(20);
    });

    it('defaults tags to an empty array and numeric stats to 0 when missing', async () => {
      const get = jest.fn().mockReturnValue(
        axiosOf({
          items: [
            {
              id: 'v1',
              snippet: { title: 'no tags', publishedAt: '2026-01-01T00:00:00Z' },
              status: { privacyStatus: 'private' },
              statistics: {},
            },
          ],
        }),
      );
      const service = buildService(get);

      const [result] = await service.getVideoDetails(['v1']);

      expect(result.tags).toEqual([]);
      expect(result.viewCount).toBe(0);
      expect(result.likeCount).toBe(0);
      expect(result.commentCount).toBe(0);
    });

    it('sends the API key when no access token is given, and omits it (using Authorization instead) when one is', async () => {
      const get = jest.fn().mockReturnValue(axiosOf({ items: [videoItem('v1', ['a', 'b'])] }));
      const service = buildService(get);

      await service.getVideoDetails(['v1']);
      expect(get.mock.calls[0][1].params.key).toBe('test-api-key');
      expect(get.mock.calls[0][1].headers).toBeUndefined();

      get.mockClear();
      const [withTags] = await service.getVideoDetails(['v1'], 'owner-access-token');
      expect(get.mock.calls[0][1].params.key).toBeUndefined();
      expect(get.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer owner-access-token' });
      expect(withTags.tags).toEqual(['a', 'b']);
    });
  });

  it('wraps a failed request in a readable error without leaking raw axios internals', async () => {
    const get = jest
      .fn()
      .mockReturnValue(throwError(() => ({ isAxiosError: true, response: { status: 403, statusText: 'Forbidden' } })));
    const service = buildService(get);

    await expect(service.getUploadsPlaylistId('UCabc')).rejects.toThrow(/YouTube API request failed: 403/);
  });
});
