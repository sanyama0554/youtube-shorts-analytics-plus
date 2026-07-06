import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { YoutubeApiService } from './youtube-api.service';

@Module({
  imports: [HttpModule],
  providers: [YoutubeApiService],
  exports: [YoutubeApiService],
})
export class YoutubeModule {}
