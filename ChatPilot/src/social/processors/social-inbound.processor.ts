import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { SocialReplyService } from '../services/social-reply.service'

@Processor(BackgroundQueue.SOCIAL, { concurrency: 2 })
export class SocialInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialInboundProcessor.name)

  constructor(private readonly socialReplyService: SocialReplyService) {
    super()
  }

  async process(job: Job): Promise<any> {
    const eventId = Number(job.data?.eventId)
    if (!Number.isFinite(eventId)) return { skipped: true }

    const action = await this.socialReplyService.handleEvent(eventId)
    this.logger.log(`Social event ${eventId} resolved as ${action}`)
    return { eventId, action }
  }
}
