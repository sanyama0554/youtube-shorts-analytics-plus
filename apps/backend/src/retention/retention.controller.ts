import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RetentionService } from './retention.service';

@Controller('api')
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Post('videos/:id/retention/sync')
  async syncVideoRetention(@Param('id') id: string) {
    await this.retentionService.syncVideoRetention(id);
    return { status: 'ok' };
  }

  @Get('videos/:id/retention')
  getVideoRetention(@Param('id') id: string) {
    return this.retentionService.getRetentionCurve(id);
  }

  @Post('sync/batch/retention')
  syncBatchRetention() {
    return this.retentionService.syncAllVideosRetention();
  }

  @Get('retention/compare')
  compareRetention(@Query('videoIds') videoIds?: string) {
    const ids = (videoIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      throw new BadRequestException('videoIds query parameter is required');
    }
    return this.retentionService.compareRetention(ids);
  }
}
