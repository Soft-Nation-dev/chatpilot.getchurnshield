import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'

@Injectable()
export class ContentSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(BackgroundQueue.CONTENT) private readonly contentQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.contentQueue.upsertJobScheduler(
      'content-publish-check',
      { pattern: '*/10 * * * *' },
      { name: 'publish-due', data: {} },
    )
    await this.contentQueue.upsertJobScheduler(
      'content-plan-check',
      { pattern: '*/5 * * * *' },
      { name: 'plan-drafts', data: {} },
    )
  }
}
