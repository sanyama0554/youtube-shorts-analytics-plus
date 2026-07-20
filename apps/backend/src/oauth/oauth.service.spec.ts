import { HttpService } from '@nestjs/axios';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthService } from './oauth.service';
import { TokenEncryptionService } from './token-encryption.service';

const CONFIG: Record<string, string> = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:4000/oauth/youtube/callback',
  YOUTUBE_CHANNEL_ID: 'UCowner',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
};

function buildService(overrides: { httpService?: Partial<HttpService>; prisma?: Record<string, unknown> } = {}) {
  const configService = { getOrThrow: jest.fn((key: string) => CONFIG[key]) } as unknown as ConfigService;
  const tokenEncryption = new TokenEncryptionService(configService);
  const httpService = {
    get: jest.fn(),
    post: jest.fn(),
    ...overrides.httpService,
  } as unknown as HttpService;
  const prisma = {
    channel: { findUnique: jest.fn() },
    oAuthToken: { upsert: jest.fn(), update: jest.fn() },
    ...overrides.prisma,
  } as unknown as PrismaService;

  const service = new OAuthService(httpService, configService, prisma, tokenEncryption);
  return { service, httpService, prisma, tokenEncryption };
}

describe('OAuthService', () => {
  describe('state generation/verification', () => {
    it('accepts a state it just generated', () => {
      const { service } = buildService();
      const state = service.generateState();
      expect(() => service.verifyState(state)).not.toThrow();
    });

    it('rejects a missing state', () => {
      const { service } = buildService();
      expect(() => service.verifyState(undefined)).toThrow(BadRequestException);
    });

    it('rejects a tampered state signature', () => {
      const { service } = buildService();
      const state = service.generateState();
      const tampered = state.slice(0, -1) + (state.endsWith('0') ? '1' : '0');
      expect(() => service.verifyState(tampered)).toThrow(BadRequestException);
    });

    it('rejects an expired state', () => {
      const { service } = buildService();
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      const state = service.generateState();

      nowSpy.mockReturnValue(1_000_000 + 10 * 60 * 1000 + 1);
      expect(() => service.verifyState(state)).toThrow(BadRequestException);
      nowSpy.mockRestore();
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('includes the expected OAuth params', () => {
      const { service } = buildService();
      const url = new URL(service.buildAuthorizationUrl('some-state'));
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.GOOGLE_OAUTH_REDIRECT_URI);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('state')).toBe('some-state');
      expect(url.searchParams.get('scope')).toContain('youtube.readonly');
      expect(url.searchParams.get('scope')).toContain('yt-analytics.readonly');
    });
  });

  describe('handleCallback', () => {
    function tokenResponse(overrides: Partial<Record<string, unknown>> = {}) {
      return of({
        data: {
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          expires_in: 3600,
          scope: 'youtube.readonly',
          token_type: 'Bearer',
          ...overrides,
        },
      } as unknown as AxiosResponse);
    }

    function channelListResponse(id: string | undefined) {
      return of({ data: { items: id ? [{ id }] : [] } } as unknown as AxiosResponse);
    }

    it('saves encrypted tokens when the account matches YOUTUBE_CHANNEL_ID', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      const findUnique = jest.fn().mockResolvedValue({ id: 'channel-db-id', youtubeChannelId: 'UCowner' });
      const { service, tokenEncryption } = buildService({
        httpService: {
          post: jest.fn().mockReturnValue(tokenResponse()),
          get: jest.fn().mockReturnValue(channelListResponse('UCowner')),
        },
        prisma: { channel: { findUnique }, oAuthToken: { upsert } },
      });

      const result = await service.handleCallback('auth-code');

      expect(result).toEqual({ channelId: 'UCowner' });
      expect(upsert).toHaveBeenCalledTimes(1);
      const call = upsert.mock.calls[0][0];
      expect(call.where).toEqual({ channelId: 'channel-db-id' });
      expect(tokenEncryption.decrypt(call.create.accessToken)).toBe('access-123');
      expect(tokenEncryption.decrypt(call.create.refreshToken)).toBe('refresh-123');
      expect(call.create.scope).toBe('youtube.readonly');
    });

    it('rejects when the authorized account does not match YOUTUBE_CHANNEL_ID', async () => {
      const { service } = buildService({
        httpService: {
          post: jest.fn().mockReturnValue(tokenResponse()),
          get: jest.fn().mockReturnValue(channelListResponse('UCsomeoneelse')),
        },
      });

      await expect(service.handleCallback('auth-code')).rejects.toThrow(ForbiddenException);
    });

    it('throws when no Channel row exists yet', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const { service } = buildService({
        httpService: {
          post: jest.fn().mockReturnValue(tokenResponse()),
          get: jest.fn().mockReturnValue(channelListResponse('UCowner')),
        },
        prisma: { channel: { findUnique }, oAuthToken: { upsert: jest.fn() } },
      });

      await expect(service.handleCallback('auth-code')).rejects.toThrow(NotFoundException);
    });

    it('throws when Google does not return a refresh_token', async () => {
      const findUnique = jest.fn().mockResolvedValue({ id: 'channel-db-id', youtubeChannelId: 'UCowner' });
      const { service } = buildService({
        httpService: {
          post: jest.fn().mockReturnValue(tokenResponse({ refresh_token: undefined })),
          get: jest.fn().mockReturnValue(channelListResponse('UCowner')),
        },
        prisma: { channel: { findUnique }, oAuthToken: { upsert: jest.fn() } },
      });

      await expect(service.handleCallback('auth-code')).rejects.toThrow(BadRequestException);
    });

    it('wraps a failed token exchange in a readable error', async () => {
      const { service } = buildService({
        httpService: {
          post: jest
            .fn()
            .mockReturnValue(throwError(() => ({ isAxiosError: true, response: { status: 400, statusText: 'Bad Request' } }))),
        },
      });

      await expect(service.handleCallback('bad-code')).rejects.toThrow(/Google OAuth request failed: 400/);
    });
  });

  describe('getValidAccessToken', () => {
    it('throws when the channel has no OAuth token yet', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const { service } = buildService({ prisma: { channel: { findUnique } } });

      await expect(service.getValidAccessToken()).rejects.toThrow(NotFoundException);
    });

    it('returns the decrypted access token when not close to expiry', async () => {
      const { tokenEncryption } = buildService();
      const encryptedAccess = tokenEncryption.encrypt('still-valid-token');
      const findUnique = jest.fn().mockResolvedValue({
        id: 'channel-db-id',
        oauthToken: {
          accessToken: encryptedAccess,
          refreshToken: tokenEncryption.encrypt('refresh-token'),
          expiryDate: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const post = jest.fn();
      const { service } = buildService({ prisma: { channel: { findUnique } }, httpService: { post } });

      const token = await service.getValidAccessToken();

      expect(token).toBe('still-valid-token');
      expect(post).not.toHaveBeenCalled();
    });

    it('refreshes the access token when it is expired', async () => {
      const { tokenEncryption } = buildService();
      const encryptedRefresh = tokenEncryption.encrypt('refresh-token');
      const findUnique = jest.fn().mockResolvedValue({
        id: 'channel-db-id',
        oauthToken: {
          accessToken: tokenEncryption.encrypt('expired-token'),
          refreshToken: encryptedRefresh,
          expiryDate: new Date(Date.now() - 1000),
        },
      });
      const update = jest.fn().mockResolvedValue({});
      const post = jest.fn().mockReturnValue(
        of({
          data: {
            access_token: 'refreshed-token',
            expires_in: 3600,
            scope: 'youtube.readonly',
            token_type: 'Bearer',
          },
        } as unknown as AxiosResponse),
      );
      const { service } = buildService({
        prisma: { channel: { findUnique }, oAuthToken: { update } },
        httpService: { post },
      });

      const token = await service.getValidAccessToken();

      expect(token).toBe('refreshed-token');
      expect(update).toHaveBeenCalledTimes(1);
      const call = update.mock.calls[0][0];
      expect(call.where).toEqual({ channelId: 'channel-db-id' });
      expect(tokenEncryption.decrypt(call.data.accessToken)).toBe('refreshed-token');
      // レスポンスにrefresh_tokenが含まれない場合はローテーションしない
      expect(call.data.refreshToken).toBeUndefined();
    });
  });
});
