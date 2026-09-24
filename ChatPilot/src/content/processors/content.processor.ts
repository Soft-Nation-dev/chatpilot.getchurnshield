import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { ContentPublisherService } from '../services/content-publisher.service'
import { ContentAutomationService } from '../services/content-automation.service'
import { MediaIntelligenceService } from '../services/media-intelligence.service'

@Processor(BackgroundQueue.CONTENT, { concurrency: 1 })
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name)

  constructor(
    private readonly publisher: ContentPublisherService,
    private readonly automation: ContentAutomationService,
    private readonly media: MediaIntelligenceService,
  ) {
    super()
  }

  async process(job: Job): Promise<any> {
    if (job.name === 'index-media') {
      const indexed = await this.media.indexPendingAll()
      return { indexed }
    }
    if (job.name === 'plan-drafts') {
      const created = await this.automation.planAll()
      if (created) {
        this.logger.log(`Created ${created} automatic content draft(s)`)
      }
      return { created }
    }

    if (job.data?.postId) {
      const action = await this.publisher.publish(Number(job.data.postId))
      return { postId: job.data.postId, action }
    }

    const published = await this.publisher.publishDue()
    if (published) {
      this.logger.log(`Published ${published} scheduled post(s)`)
    }
    return { published }
  }
}
