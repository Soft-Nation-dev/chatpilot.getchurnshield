import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { LEADS_OUTREACH_QUEUE, LeadJobKind } from '../leads.constants'
import { LeadsService } from '../services/leads.service'

@Processor(LEADS_OUTREACH_QUEUE, { concurrency: 1 })
export class LeadsOutreachProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadsOutreachProcessor.name)

  constructor(private readonly leadsService: LeadsService) {
    super()
  }

  async process(job: Job): Promise<void> {
    const { companyId, leadId, text } = job.data as {
      companyId: number
      leadId: number
      text?: string
    }
    try {
      if (job.name === LeadJobKind.MANUAL) {
        await this.leadsService.processManual(companyId, leadId, text ?? '')
      } else if (job.name === LeadJobKind.AI_OPEN) {
        const sent = await this.leadsService.processAiOpen(companyId, leadId)
        if (!sent) return
      }
      await this.leadsService.recordOutreachOutcome(companyId, leadId, {
        jobType: job.name === LeadJobKind.AI_OPEN ? 'lead_ai_outreach' : 'lead_manual_outreach',
        status: 'succeeded',
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 1,
        jobId: String(job.id),
      })
    } catch (err) {
      await this.leadsService.recordOutreachOutcome(companyId, leadId, {
        jobType: job.name === LeadJobKind.AI_OPEN ? 'lead_ai_outreach' : 'lead_manual_outreach',
        status: job.attemptsMade + 1 < (job.opts.attempts || 1) ? 'retrying' : 'failed',
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 1,
        jobId: String(job.id),
        error: err,
      })
      this.logger.error(
        `Lead outreach job failed (${job.name}): ${err instanceof Error ? err.message : String(err)}`,
      )
      throw err
    }
  }
}
