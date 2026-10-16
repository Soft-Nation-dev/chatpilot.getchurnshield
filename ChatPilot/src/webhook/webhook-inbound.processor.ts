import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { WhatsBaileyDto } from './dto/whats-bailey.dto'
import { WebhookService } from './webhook.service'

@Processor(BackgroundQueue.WHATSAPP_INBOUND, { concurrency: 8 })
export class WebhookInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookInboundProcessor.name)

  constructor(private readonly webhookService: WebhookService) {
    super()
  }

  async process(job: Job<WhatsBaileyDto>) {
    const started = Date.now()
    try {
      const result = await this.webhookService.whatsBaileyWebhook(job.data)
      return { result, latencyMs: Date.now() - started }
    } catch (error) {
      this.logger.error(
        `Inbound WhatsApp job ${job.id} failed on attempt ${job.attemptsMade + 1}`,
        error instanceof Error ? error.stack : String(error),
      )
      throw error
    }
  }
}
