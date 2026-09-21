import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'

@Injectable()
export class LearningSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(BackgroundQueue.LEARNING)
    private readonly learningQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.learningQueue.upsertJobScheduler(
      'learning-sweep',
      { pattern: process.env.LEARNING_CRON || '0 3 * * *' },
      { name: 'sweep', data: {} },
    )
  }
}
