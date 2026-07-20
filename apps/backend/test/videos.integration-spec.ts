import { INestApplication } from '@nestjs/common';
import * as nock from 'nock';
import * as request from 'supertest';
import { createTestApp } from './app.util';
import { resetDatabase } from './reset-db';
import { PrismaService } from '../src/prisma/prisma.service';

const CHANNEL_ID = 'UCtestChannelId000000';

function mockYoutubeDataApi() {
  // syncFromYoutube()はensureChannel()とfetchAllVideos()の両方でchannels.listを呼ぶため
  // 1回の同期で2回リクエストが飛ぶ。persist()で複数回分カバーする。
  nock('https://www.googleapis.com')
    .persist()
    .get('/youtube/v3/channels')
    .query(true)
    .reply(200, { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUxxxxxxxxxxxxxxxxxxxx' } } }] });

  nock('https://www.googleapis.com')
    .persist()
    .get('/youtube/v3/playlistItems')
    .query(true)
    .reply(200, { items: [{ contentDetails: { videoId: 'video-yt-1' } }, { contentDetails: { videoId: 'video-yt-2' } }] });

  nock('https://www.googleapis.com')
    .persist()
    .get('/youtube/v3/videos')
    .query(true)
    .reply(200, {
      items: [
        {
          id: 'video-yt-1',
          snippet: { title: '動画1', publishedAt: '2026-01-01T00:00:00Z' },
          status: { privacyStatus: 'public' },
          statistics: { viewCount: '100', likeCount: '10', commentCount: '2' },
        },
        {
          id: 'video-yt-2',
          snippet: { title: '動画2', publishedAt: '2026-01-02T00:00:00Z' },
          status: { privacyStatus: 'public' },
          statistics: { viewCount: '50', likeCount: '5', commentCount: '1' },
        },
      ],
    });
}

describe('Videos (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    nock.cleanAll();
  });

  it('POST /api/videos/sync fetches from YouTube and persists to the DB', async () => {
    mockYoutubeDataApi();

    const res = await request(app.getHttpServer()).post('/api/videos/sync').expect(201);

    expect(res.body).toHaveLength(2);
    const titles = res.body.map((v: { title: string }) => v.title).sort();
    expect(titles).toEqual(['動画1', '動画2']);

    const stored = await prisma.channel.findUnique({ where: { youtubeChannelId: CHANNEL_ID } });
    expect(stored).not.toBeNull();
    const videoCount = await prisma.video.count();
    expect(videoCount).toBe(2);
  });

  it('GET /api/videos serves from the DB cache without calling YouTube again once synced', async () => {
    mockYoutubeDataApi();
    await request(app.getHttpServer()).post('/api/videos/sync').expect(201);

    // 2回目のリクエストで外部APIが叩かれたら、モックが登録されていないため落ちる
    const res = await request(app.getHttpServer()).get('/api/videos').expect(200);

    expect(res.body).toHaveLength(2);
  });

  it('GET /api/videos/summary computes aggregates from stored videos', async () => {
    mockYoutubeDataApi();
    await request(app.getHttpServer()).post('/api/videos/sync').expect(201);

    const res = await request(app.getHttpServer()).get('/api/videos/summary').expect(200);

    expect(res.body.totalVideos).toBe(2);
    expect(res.body.totalViewCount).toBe(150);
  });

  it('GET /api/videos/summary returns zeroed-out values when no videos exist yet', async () => {
    const res = await request(app.getHttpServer()).get('/api/videos/summary').expect(200);

    expect(res.body).toEqual({
      totalVideos: 0,
      totalViewCount: 0,
      averageLikeRate: 0,
      averageCommentRate: 0,
      lastFetchedAt: null,
    });
  });

  it('GET /api/videos falls back to cached data (200, not 500) when the YouTube API errors', async () => {
    // 事前に正常同期して古いキャッシュを作っておく
    mockYoutubeDataApi();
    await request(app.getHttpServer()).post('/api/videos/sync').expect(201);
    await prisma.video.updateMany({ data: { lastFetchedAt: new Date(Date.now() - 61 * 60 * 1000) } });

    // 次回アクセス時、YouTube側がクォータ超過等でエラーを返す状況を再現する
    nock.cleanAll();
    nock('https://www.googleapis.com').get('/youtube/v3/channels').query(true).reply(403, { error: 'quotaExceeded' });

    const res = await request(app.getHttpServer()).get('/api/videos').expect(200);

    expect(res.body).toHaveLength(2);
    const titles = res.body.map((v: { title: string }) => v.title).sort();
    expect(titles).toEqual(['動画1', '動画2']);
  });
});
