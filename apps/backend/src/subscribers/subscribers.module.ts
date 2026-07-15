import { Module } from '@nestjs/common';
import { OAuthModule } from '../oauth/oauth.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  imports: [OAuthModule, YoutubeModule],
  controllers: [SubscribersController],
  providers: [SubscribersService],
})
export class SubscribersModule {}
