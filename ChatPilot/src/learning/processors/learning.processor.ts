import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { LearningService } from '../services/learning.service'

@Processor(BackgroundQueue.LEARNING, { concurrency: 1 })
export class LearningProcessor extends WorkerHost {
  private readonly logger = new Logger(LearningProcessor.name)

  constructor(private readonly learningService: LearningService) {
    super()
  }

  async process(job: Job): Promise<any> {
    if (job.data?.companyId) {
      const companyId = Number(job.data.companyId)
      const conversation =
        await this.learningService.learnFromConversations(companyId)
      const content = await this.learningService.learnFromContent(companyId)
      return { companyId, conversation, content }
    }

    this.logger.log('Starting scheduled learning sweep')
    const result = await this.learningService.runForAllCompanies()
    this.logger.log(
      `Learning sweep complete: ${result.analysed} company(s) updated`,
    )
    return result
  }
}
