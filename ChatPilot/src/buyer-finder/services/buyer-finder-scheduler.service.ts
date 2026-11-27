import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import {
  BUYER_FINDER_QUEUE,
  BuyerFinderJobKind,
} from '../buyer-finder.constants'

@Injectable()
export class BuyerFinderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BuyerFinderSchedulerService.name)

  constructor(@InjectQueue(BUYER_FINDER_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'buyer-finder-scan',
      { pattern: '*/30 * * * *' },
      { name: BuyerFinderJobKind.SCAN },
    )
    await this.queue.upsertJobScheduler(
      'buyer-finder-discovery',
      { pattern: '15 2 * * 1' },
      { name: BuyerFinderJobKind.DISCOVER },
    )
    this.logger.log(
      'Buyer Finder schedules registered; global kill switch remains authoritative',
    )
  }
}
