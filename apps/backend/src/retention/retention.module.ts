import { Module } from '@nestjs/common';
import { OAuthModule } from '../oauth/oauth.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [OAuthModule, YoutubeModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
