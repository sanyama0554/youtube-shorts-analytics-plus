import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { YoutubeAnalyticsApiService } from './youtube-analytics-api.service';
import { YoutubeApiService } from './youtube-api.service';

@Module({
  imports: [HttpModule],
  providers: [YoutubeApiService, YoutubeAnalyticsApiService],
  exports: [YoutubeApiService, YoutubeAnalyticsApiService],
})
export class YoutubeModule {}
