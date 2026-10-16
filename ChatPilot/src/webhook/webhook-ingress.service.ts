import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'
import { WhatsBaileyDto } from './dto/whats-bailey.dto'

@Injectable()
export class WebhookIngressService {
  private readonly logger = new Logger(WebhookIngressService.name)

  constructor(
    @InjectQueue(BackgroundQueue.WHATSAPP_INBOUND)
    private readonly inboundQueue: Queue,
  ) {}

  async accept(payload: WhatsBaileyDto) {
    const rawId = payload.id || `${payload.userPhone}-${Date.now()}`
    const jobId = `wa-${String(payload.sessionId || 'session')}-${String(rawId)}`
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120)
    try {
      await this.inboundQueue.add(BackgroundQueue.WHATSAPP_INBOUND, payload, {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      })
      return { accepted: true, jobId }
    } catch (error) {
      if (String(error).toLowerCase().includes('job') && String(error).toLowerCase().includes('exist')) {
        this.logger.debug(`Duplicate inbound event ${jobId} acknowledged`)
        return { accepted: true, duplicate: true, jobId }
      }
      throw error
    }
  }
}
