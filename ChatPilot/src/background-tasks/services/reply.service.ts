import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { BackgroundQueue } from 'src/utils/constants/background.constants'

@Injectable()
export class ReplyService {
  private readonly logger = new Logger(ReplyService.name)
  constructor(
    @InjectQueue(BackgroundQueue.REPLIES) private replyQueue: Queue,
  ) {}
  async addReplyTask(taskData: {
    clientId: number
    message?: string
    contactPhone?: bigint
    companyId?: number
    companyPhone?: bigint
    fromMe?: boolean
    originalMessageType?: string
    senderName?: string
  }) {
    const debounceMs = Math.max(
      5000,
      Math.min(8000, Number(process.env.WHATSAPP_DEBOUNCE_MS || 6500)),
    )
    const stableJobId = `reply-${taskData.clientId}`
    const existing = await this.replyQueue.getJob(stableJobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'delayed') {
        await existing.updateData(taskData)
        await existing.changeDelay(debounceMs)
        this.logger.debug(`Debounced reply task for ${taskData.clientId}`)
        return existing
      }
    }

    const jobId = existing
      ? `${stableJobId}-${Date.now()}`
      : stableJobId
    const task = await this.replyQueue.add(BackgroundQueue.REPLIES, taskData, {
      jobId,
      attempts: 4,
      // Prefer a delayed intelligent answer over an immediate unrelated
      // fallback. Retries occur after roughly 30s, 60s and 120s, and the
      // processor suppresses them when a team member has already replied.
      backoff: { type: 'exponential', delay: 30_000 },
      delay: debounceMs,
      removeOnComplete: true,
      removeOnFail: 200,
    })
    this.logger.log(`Reply task ${task.id} queued with ${debounceMs}ms debounce`)
    return task
  }

  async findStuckJobs() {
    const activeJobs = await this.replyQueue.getJobs(['active'])
    activeJobs.forEach(job => {
      console.log(
        `Job ID: ${job.id}, State: active, Timestamp: ${job.processedOn}`,
      )
    })
    for (const job of activeJobs) {
      await this.replyQueue.remove(job.id)
    }
    return { totalRemovedJobs: activeJobs.length, jobs: activeJobs }
  }

  async removeStuckJob(jobId: string) {
    await this.replyQueue.remove(jobId)
  }
}
