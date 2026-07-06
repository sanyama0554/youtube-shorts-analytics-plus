import { Controller, Get, Post } from '@nestjs/common';
import { VideosService } from './videos.service';

@Controller('api/videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  getVideos() {
    return this.videosService.getVideos();
  }

  @Get('summary')
  getSummary() {
    return this.videosService.getSummary();
  }

  @Post('sync')
  syncVideos() {
    return this.videosService.syncFromYoutube();
  }
}
