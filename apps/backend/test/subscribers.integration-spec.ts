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

describe('Subscribers (integration)', () => {
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

  async function seedConnectedChannelWithVideo(youtubeVideoId = 'yt-1') {
    const channel = await prisma.channel.upsert({
      where: { youtubeChannelId: CHANNEL_ID },
      create: { youtubeChannelId: CHANNEL_ID, title: CHANNEL_ID, uploadsPlaylistId: 'UUxxx' },
      update: {},
    });
    const existingToken = await prisma.oAuthToken.findUnique({ where: { channelId: channel.id } });
    if (!existingToken) {
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
    }
    const video = await prisma.video.create({
      data: {
        youtubeVideoId,
        channelId: channel.id,
        title: `video ${youtubeVideoId}`,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        privacyStatus: 'public',
        viewCount: 100,
        likeCount: 10,
        commentCount: 2,
      },
    });
    return { channel, video };
  }

  it('POST /api/videos/:id/subscribers/sync writes the fetched total onto the video', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([[8]]);

    await request(app.getHttpServer()).post(`/api/videos/${video.id}/subscribers/sync`).expect(201);

    const updated = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(updated.subscribersGained).toBe(8);
  });

  it('POST /api/videos/:id/subscribers/sync 404s for an unknown video id', async () => {
    await request(app.getHttpServer()).post('/api/videos/does-not-exist/subscribers/sync').expect(404);
  });

  it('overwrites the previous total on re-sync rather than accumulating', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([[8]]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/subscribers/sync`).expect(201);

    nock.cleanAll();
    mockAnalyticsApi([[3]]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/subscribers/sync`).expect(201);

    const updated = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(updated.subscribersGained).toBe(3);
  });

  it('GET /api/videos includes the synced total via the standard video list', async () => {
    const { video } = await seedConnectedChannelWithVideo();
    mockAnalyticsApi([[8]]);
    await request(app.getHttpServer()).post(`/api/videos/${video.id}/subscribers/sync`).expect(201);

    const res = await request(app.getHttpServer()).get('/api/videos').expect(200);

    const found = res.body.find((v: { id: string }) => v.id === video.id);
    expect(found.subscribersGained).toBe(8);
  });

  it('POST /api/sync/batch/subscribers syncs every video and reports the totals', async () => {
    await seedConnectedChannelWithVideo('yt-1');
    await seedConnectedChannelWithVideo('yt-2');
    mockAnalyticsApi([[4]]);

    const res = await request(app.getHttpServer()).post('/api/sync/batch/subscribers').expect(201);

    expect(res.body).toEqual({ total: 2, succeeded: 2, failed: [] });
  });
});
