import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { OAuthModule } from '../oauth/oauth.module';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';
import { YoutubeAnalyticsApiService } from './youtube-analytics-api.service';

@Module({
  imports: [HttpModule, OAuthModule],
  controllers: [RetentionController],
  providers: [RetentionService, YoutubeAnalyticsApiService],
})
export class RetentionModule {}
