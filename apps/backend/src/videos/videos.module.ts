import { Module } from '@nestjs/common';
import { YoutubeModule } from '../youtube/youtube.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [YoutubeModule],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
