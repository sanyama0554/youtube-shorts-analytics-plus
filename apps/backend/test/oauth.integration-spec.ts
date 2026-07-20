import { INestApplication } from '@nestjs/common';
import * as nock from 'nock';
import * as request from 'supertest';
import { createTestApp, getTestTokenEncryption } from './app.util';
import { resetDatabase } from './reset-db';
import { PrismaService } from '../src/prisma/prisma.service';

const CHANNEL_ID = 'UCtestChannelId000000';

function mockTokenExchange(overrides: Partial<Record<string, unknown>> = {}) {
  nock('https://oauth2.googleapis.com')
    .post('/token')
    .reply(200, {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      scope: 'youtube.readonly yt-analytics.readonly',
      token_type: 'Bearer',
      ...overrides,
    });
}

function mockChannelOwnership(returnedChannelId: string | undefined) {
  nock('https://www.googleapis.com')
    .get('/youtube/v3/channels')
    .query(true)
    .reply(200, { items: returnedChannelId ? [{ id: returnedChannelId }] : [] });
}

describe('OAuth (integration)', () => {
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

  it('GET /oauth/youtube/authorize redirects to Google with the expected params', async () => {
    const res = await request(app.getHttpServer()).get('/oauth/youtube/authorize').expect(302);

    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:4000/oauth/youtube/callback');
    expect(location.searchParams.get('prompt')).toBe('consent');
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  describe('GET /oauth/youtube/callback', () => {
    it('rejects a request with no code', async () => {
      await request(app.getHttpServer()).get('/oauth/youtube/callback').expect(400);
    });

    it('redirects to the frontend with ?oauth=denied when Google reports an error', async () => {
      const res = await request(app.getHttpServer()).get('/oauth/youtube/callback').query({ error: 'access_denied' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:3000/?oauth=success'.replace('success', 'denied'));
    });

    it('rejects a missing/invalid state', async () => {
      await request(app.getHttpServer()).get('/oauth/youtube/callback').query({ code: 'abc' }).expect(400);
    });

    it('saves the encrypted token and redirects on success when the channel matches and already exists', async () => {
      await prisma.channel.create({
        data: { youtubeChannelId: CHANNEL_ID, title: CHANNEL_ID, uploadsPlaylistId: 'UUxxx' },
      });
      mockTokenExchange();
      mockChannelOwnership(CHANNEL_ID);

      const authorizeRes = await request(app.getHttpServer()).get('/oauth/youtube/authorize').expect(302);
      const state = new URL(authorizeRes.headers.location).searchParams.get('state')!;

      const res = await request(app.getHttpServer())
        .get('/oauth/youtube/callback')
        .query({ code: 'auth-code', state });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:3000/?oauth=success');

      const channel = await prisma.channel.findUniqueOrThrow({ where: { youtubeChannelId: CHANNEL_ID } });
      const savedToken = await prisma.oAuthToken.findUniqueOrThrow({ where: { channelId: channel.id } });
      const tokenEncryption = getTestTokenEncryption(app);
      expect(tokenEncryption.decrypt(savedToken.accessToken)).toBe('new-access-token');
      expect(tokenEncryption.decrypt(savedToken.refreshToken)).toBe('new-refresh-token');
    });

    it('rejects (403) when the authorized Google account does not own the configured channel', async () => {
      await prisma.channel.create({
        data: { youtubeChannelId: CHANNEL_ID, title: CHANNEL_ID, uploadsPlaylistId: 'UUxxx' },
      });
      mockTokenExchange();
      mockChannelOwnership('UCsomeoneelse');

      const authorizeRes = await request(app.getHttpServer()).get('/oauth/youtube/authorize');
      const state = new URL(authorizeRes.headers.location).searchParams.get('state')!;

      await request(app.getHttpServer())
        .get('/oauth/youtube/callback')
        .query({ code: 'auth-code', state })
        .expect(403);

      const tokenCount = await prisma.oAuthToken.count();
      expect(tokenCount).toBe(0);
    });

    it('rejects (404) when no Channel row exists yet (videos have never been synced)', async () => {
      mockTokenExchange();
      mockChannelOwnership(CHANNEL_ID);

      const authorizeRes = await request(app.getHttpServer()).get('/oauth/youtube/authorize');
      const state = new URL(authorizeRes.headers.location).searchParams.get('state')!;

      await request(app.getHttpServer())
        .get('/oauth/youtube/callback')
        .query({ code: 'auth-code', state })
        .expect(404);
    });
  });
});
