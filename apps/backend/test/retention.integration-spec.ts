import { INestApplication } from '@nestjs/common';
import * as nock from 'nock';
import * as request from 'supertest';
import { createTestApp, getTestTokenEncryption } from './app.util';
import { resetDatabase } from './reset-db';
import { PrismaService } from '../src/prisma/prisma.service';

const CHANNEL_ID = 'UCtestChannelId000000';

function mockAnalyticsApi(rows: number[][]) {
  nock('https://youtubeanalytics.googleapis.com').persist().get('/v2/reports').query(true).reply(200, { rows });
}

describe('Retention (integration)', () => {
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

  // OAuth連携済みの状態を作る共通セットアップ。維持率APIは所有者トークンが必須なため。
  async function seedConnectedChannelWithVideo() {
    const channel = await prisma.channel.create({
      data: { youtubeChannelId: CHANNEL_ID, title: CHANNEL_ID, uploadsPlaylistId: 'UUxxx' },
    });
    const tokenEncryption = getTestTokenEncryption(app);
    await prisma.oAuthToken.create({
      data: {
        channelId: channel.id,
        accessToken: tokenEncryption.encrypt('valid-access-token'),
        refreshToken: tokenEncryption.encrypt('valid-refresh-token'),
        scope: 'youtube.readonly yt-analytics.readonly',
        expiryDate: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const video = await prisma.video.create({
      data: {
        youtubeVideoId: 'yt-1',
        channelId: channel.id,
        title: 'video 1',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        privacyStatus: 'public',
        viewCount: 100,
        likeCount: 10,
        commentCount: 2,
      },
    });
    return { channel, video };
  }

  it('POST /api/videos/:id/retention/sync stores points fetched from Analytics API', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([
      [0.01, 1.5, 0.7],
      [1, 0.4, 0.9],
    ]);

    await request(app.getHttpServer()).post(`/api/videos/${video.id}/retention/sync`).expect(201);

    const points = await prisma.retentionPoint.findMany({ where: { videoId: video.id } });
    expect(points).toHaveLength(2);
  });

  it('POST /api/videos/:id/retention/sync 404s for an unknown video id', async () => {
    await request(app.getHttpServer()).post('/api/videos/does-not-exist/retention/sync').expect(404);
  });

  it('GET /api/videos/:id/retention returns the stored curve ordered by elapsed ratio', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([
      [1, 0.4, 0.9],
      [0.01, 1.5, 0.7],
    ]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/retention/sync`).expect(201);

    const res = await request(app.getHttpServer()).get(`/api/videos/${video.id}/retention`).expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0].elapsedVideoTimeRatio).toBe(0.01);
    expect(res.body[1].elapsedVideoTimeRatio).toBe(1);
  });

  it('re-syncing the same video upserts (overwrites) rather than duplicating rows', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([[0.01, 1.5, 0.7]]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/retention/sync`).expect(201);

    nock.cleanAll();
    mockAnalyticsApi([[0.01, 0.5, 0.2]]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/retention/sync`).expect(201);

    const points = await prisma.retentionPoint.findMany({ where: { videoId: video.id } });
    expect(points).toHaveLength(1);
    expect(points[0].audienceWatchRatio).toBe(0.5);
  });

  it('GET /api/retention/compare groups curves by video id, requires at least one id', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([[0.01, 1.5, 0.7]]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/retention/sync`).expect(201);

    await request(app.getHttpServer()).get('/api/retention/compare').expect(400);

    const res = await request(app.getHttpServer())
      .get('/api/retention/compare')
      .query({ videoIds: `${video.id},unknown-video` })
      .expect(200);

    expect(res.body[video.id]).toHaveLength(1);
    expect(res.body['unknown-video']).toEqual([]);
  });

  it('POST /api/sync/batch/retention syncs every video and reports the totals', async () => {
    await seedConnectedChannelWithVideo();
    const channel = await prisma.channel.findUniqueOrThrow({ where: { youtubeChannelId: CHANNEL_ID } });
    await prisma.video.create({
      data: {
        youtubeVideoId: 'yt-2',
        channelId: channel.id,
        title: 'video 2',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        privacyStatus: 'public',
        viewCount: 50,
        likeCount: 5,
        commentCount: 1,
      },
    });
    mockAnalyticsApi([[0.01, 1.5, 0.7]]);

    const res = await request(app.getHttpServer()).post('/api/sync/batch/retention').expect(201);

    expect(res.body).toEqual({ total: 2, succeeded: 2, failed: [] });
  });

  it('POST /api/videos/:id/retention/sync fails when OAuth is not connected yet', async () => {
    const channel = await prisma.channel.create({
      data: { youtubeChannelId: CHANNEL_ID, title: CHANNEL_ID, uploadsPlaylistId: 'UUxxx' },
    });
    const video = await prisma.video.create({
      data: {
        youtubeVideoId: 'yt-1',
        channelId: channel.id,
        title: 'video 1',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        privacyStatus: 'public',
        viewCount: 100,
        likeCount: 10,
        commentCount: 2,
      },
    });

    await request(app.getHttpServer()).post(`/api/videos/${video.id}/retention/sync`).expect(404);
  });
});
