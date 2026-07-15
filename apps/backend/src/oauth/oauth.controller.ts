import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('oauth/youtube')
export class OAuthController {
  private readonly frontendOrigin: string;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {
    this.frontendOrigin = this.configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  }

  @Get('authorize')
  authorize(@Res() res: Response): void {
    const state = this.oauthService.generateState();
    res.redirect(this.oauthService.buildAuthorizationUrl(state));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.redirect(`${this.frontendOrigin}/?oauth=denied`);
      return;
    }
    if (!code) {
      throw new BadRequestException('missing code parameter');
    }

    this.oauthService.verifyState(state);
    await this.oauthService.handleCallback(code);

    res.redirect(`${this.frontendOrigin}/?oauth=success`);
  }
}
