import { HttpService } from '@nestjs/axios';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { createHmac, randomBytes } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface YoutubeChannelListResponse {
  items?: { id?: string }[];
}

@Injectable()
export class OAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly ownerChannelId: string;
  private readonly stateSecret: Buffer;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {
    this.clientId = this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    this.redirectUri = this.configService.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI');
    this.ownerChannelId = this.configService.getOrThrow<string>('YOUTUBE_CHANNEL_ID');
    // state署名専用の鍵をTOKEN_ENCRYPTION_KEYから分離して導出する（暗号鍵とHMAC鍵の使い回しを避けるため）
    this.stateSecret = createHmac(
      'sha256',
      Buffer.from(this.configService.getOrThrow<string>('TOKEN_ENCRYPTION_KEY'), 'hex'),
    )
      .update('oauth-state')
      .digest();
  }

  // CSRF対策のstateパラメータ。サーバー側にセッションを持たず、
  // 発行時刻+署名を自己完結させたトークンとして検証する。
  generateState(): string {
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = Date.now().toString();
    const payload = `${issuedAt}.${nonce}`;
    const signature = createHmac('sha256', this.stateSecret).update(payload).digest('hex');
    return `${payload}.${signature}`;
  }

  verifyState(state: string | undefined): void {
    if (!state) {
      throw new BadRequestException('missing state parameter');
    }
    const parts = state.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException('invalid state parameter');
    }
    const [issuedAt, nonce, signature] = parts;
    const payload = `${issuedAt}.${nonce}`;
    const expectedSignature = createHmac('sha256', this.stateSecret).update(payload).digest('hex');
    if (signature !== expectedSignature) {
      throw new BadRequestException('state signature mismatch');
    }
    if (Date.now() - Number(issuedAt) > STATE_TTL_MS) {
      throw new BadRequestException('state expired');
    }
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      // 再認可のたびに必ずrefresh_tokenを発行させるため毎回同意画面を出す
      prompt: 'consent',
      scope: SCOPES.join(' '),
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{ channelId: string }> {
    const tokens = await this.exchangeCodeForTokens(code);
    const ownedChannelId = await this.verifyOwnership(tokens.access_token);

    const channel = await this.prisma.channel.findUnique({ where: { youtubeChannelId: ownedChannelId } });
    if (!channel) {
      throw new NotFoundException(
        `channel ${ownedChannelId} not found. run a videos sync before connecting OAuth.`,
      );
    }

    if (!tokens.refresh_token) {
      throw new BadRequestException('Google did not return a refresh_token; retry authorization');
    }

    const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.oAuthToken.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        accessToken: this.tokenEncryption.encrypt(tokens.access_token),
        refreshToken: this.tokenEncryption.encrypt(tokens.refresh_token),
        scope: tokens.scope,
        expiryDate,
      },
      update: {
        accessToken: this.tokenEncryption.encrypt(tokens.access_token),
        refreshToken: this.tokenEncryption.encrypt(tokens.refresh_token),
        scope: tokens.scope,
        expiryDate,
      },
    });

    return { channelId: ownedChannelId };
  }

  // Analytics/タグ取得系サービスが呼び出す想定。期限切れならリフレッシュしてから返す。
  async getValidAccessToken(): Promise<string> {
    const channel = await this.prisma.channel.findUnique({
      where: { youtubeChannelId: this.ownerChannelId },
      include: { oauthToken: true },
    });
    if (!channel?.oauthToken) {
      throw new NotFoundException('channel is not connected via OAuth yet');
    }

    const { oauthToken } = channel;
    if (oauthToken.expiryDate.getTime() - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
      return this.tokenEncryption.decrypt(oauthToken.accessToken);
    }

    return this.refreshAccessToken(channel.id, this.tokenEncryption.decrypt(oauthToken.refreshToken));
  }

  private async refreshAccessToken(channelId: string, refreshToken: string): Promise<string> {
    const tokens = await this.request<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.oAuthToken.update({
      where: { channelId },
      data: {
        accessToken: this.tokenEncryption.encrypt(tokens.access_token),
        // リフレッシュ応答にrefresh_tokenが含まれる場合のみローテーションする
        ...(tokens.refresh_token ? { refreshToken: this.tokenEncryption.encrypt(tokens.refresh_token) } : {}),
        scope: tokens.scope,
        expiryDate,
      },
    });

    return tokens.access_token;
  }

  private async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    return this.request<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });
  }

  private async verifyOwnership(accessToken: string): Promise<string> {
    const data = await this.request<YoutubeChannelListResponse>(
      `${YOUTUBE_API_BASE_URL}/channels`,
      { part: 'id', mine: 'true' },
      accessToken,
    );
    const returnedChannelId = data.items?.[0]?.id;
    if (!returnedChannelId || returnedChannelId !== this.ownerChannelId) {
      throw new ForbiddenException('authorized account does not match the configured YOUTUBE_CHANNEL_ID');
    }
    return returnedChannelId;
  }

  // paramsやレスポンスにトークンが含まれるため、axiosの生エラーはそのままログ/例外に出さない
  private async request<T>(
    url: string,
    params: Record<string, string>,
    bearerToken?: string,
  ): Promise<T> {
    try {
      const isTokenEndpoint = url === GOOGLE_TOKEN_URL;
      const { data } = await firstValueFrom(
        isTokenEndpoint
          ? this.httpService.post<T>(url, new URLSearchParams(params).toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            })
          : this.httpService.get<T>(url, {
              params,
              headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
            }),
      );
      return data;
    } catch (error) {
      if (isAxiosError(error)) {
        throw new Error(
          `Google OAuth request failed: ${error.response?.status ?? 'unknown status'} ${error.response?.statusText ?? ''}`.trim(),
        );
      }
      throw error;
    }
  }
}
