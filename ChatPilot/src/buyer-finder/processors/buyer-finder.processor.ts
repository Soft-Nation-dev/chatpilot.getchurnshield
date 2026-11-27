import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import {
  BUYER_FINDER_QUEUE,
  BuyerFinderJobKind,
  buyerFinderGloballyEnabled,
} from '../buyer-finder.constants'
import { BuyerFinderClassifierService } from '../services/buyer-finder-classifier.service'
import { BuyerFinderIngestionService } from '../services/buyer-finder-ingestion.service'

@Processor(BUYER_FINDER_QUEUE, { concurrency: 1 })
export class BuyerFinderProcessor extends WorkerHost {
  private readonly logger = new Logger(BuyerFinderProcessor.name)

  constructor(
    private readonly ingestion: BuyerFinderIngestionService,
    private readonly classifier: BuyerFinderClassifierService,
    @InjectQueue(BUYER_FINDER_QUEUE) private readonly queue: Queue,
  ) {
    super()
  }

  async process(job: Job) {
    if (!buyerFinderGloballyEnabled()) {
      return { skipped: true, reason: 'global_kill_switch' }
    }
    const tracked = [
      BuyerFinderJobKind.DISCOVER,
      BuyerFinderJobKind.SCAN,
    ].includes(job.name as BuyerFinderJobKind)
    const run = tracked
      ? await this.ingestion.startRun({
          kind: job.name,
          jobId: String(job.id || ''),
          attempt: job.attemptsMade + 1,
          maxAttempts: Number(job.opts.attempts) || 1,
        })
      : null

    try {
      const result = await this.execute(job)
      if (run) await this.ingestion.completeRun(run.id, result)
      return result
    } catch (error) {
      if (run) await this.ingestion.failRun(run.id, error)
      throw error
    }
  }

  private async execute(job: Job): Promise<any> {
    if (job.name === BuyerFinderJobKind.DISCOVER) {
      return this.ingestion.discover()
    }
    if (job.name === BuyerFinderJobKind.SCAN) {
      const result = await this.ingestion.scan()
      for (const commentId of result.commentIds) {
        await this.queue.add(
          BuyerFinderJobKind.QUALIFY,
          { commentId },
          {
            jobId: `buyer-finder-comment-${commentId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: 1000,
          },
        )
      }
      return { ...result, queued: result.commentIds.length }
    }
    if (job.name === BuyerFinderJobKind.QUALIFY) {
      return this.classifier.classify(Number(job.data?.commentId))
    }
    this.logger.warn(`Ignored unknown Buyer Finder job ${job.name}`)
    return { skipped: true, reason: 'unknown_job' }
  }
}
