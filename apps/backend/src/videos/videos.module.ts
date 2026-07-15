import { Module } from '@nestjs/common';
import { OAuthModule } from '../oauth/oauth.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [YoutubeModule, OAuthModule],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
