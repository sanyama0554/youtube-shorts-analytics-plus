import { Controller, Param, Post } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';

@Controller('api')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post('videos/:id/subscribers/sync')
  async syncVideoSubscribersGained(@Param('id') id: string) {
    await this.subscribersService.syncVideoSubscribersGained(id);
    return { status: 'ok' };
  }

  @Post('sync/batch/subscribers')
  syncBatchSubscribersGained() {
    return this.subscribersService.syncAllVideosSubscribersGained();
  }
}
