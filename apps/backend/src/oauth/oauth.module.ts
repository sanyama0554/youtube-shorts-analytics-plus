import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { TokenEncryptionService } from './token-encryption.service';

@Module({
  imports: [HttpModule],
  controllers: [OAuthController],
  providers: [OAuthService, TokenEncryptionService],
  exports: [OAuthService],
})
export class OAuthModule {}
