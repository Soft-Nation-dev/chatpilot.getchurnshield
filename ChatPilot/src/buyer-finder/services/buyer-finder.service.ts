import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { buyerFinderGloballyEnabled } from '../buyer-finder.constants'

@Injectable()
export class BuyerFinderService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(companyId: number) {
    const settings = await this.prisma.buyer_finder_settings.upsert({
      where: { company_id: companyId },
      create: { company_id: companyId },
      update: {},
    })
    return {
      ...settings,
      global_enabled: buyerFinderGloballyEnabled(),
      operating_mode: !settings.enabled
        ? 'off'
        : settings.shadow_mode
          ? 'shadow'
          : 'live',
    }
  }

  async updateSettings(
    companyId: number,
    input: {
      enabled?: boolean
      shadow_mode?: boolean
      target_states?: string[]
      exclusivity_limit?: number
      min_intent_score?: number
      daily_outreach_limit?: number
    },
  ) {
    const targetStates = input.target_states
      ? [...new Set(input.target_states.map(value => value.trim()))]
      : undefined
    if (targetStates && !targetStates.length) {
      throw new BadRequestException('Select at least one target state')
    }
    return this.prisma.buyer_finder_settings.upsert({
      where: { company_id: companyId },
      create: {
        company_id: companyId,
        ...input,
        ...(targetStates ? { target_states: targetStates } : {}),
      },
      update: {
        ...input,
        ...(targetStates ? { target_states: targetStates } : {}),
      },
    })
  }

  async feed(
    companyId: number,
    filters: { channel?: string; status?: string; limit?: number },
  ) {
    const rows = await this.prisma.buyer_finder_allocations.findMany({
      where: {
        company_id: companyId,
        ...(filters.status && filters.status !== 'all'
          ? { status: filters.status }
          : {}),
        ...(filters.channel && filters.channel !== 'all'
          ? { candidate: { channel: filters.channel } }
          : {}),
      },
      include: {
        candidate: {
          include: {
            comment: { include: { post: true } },
          },
        },
        events: { orderBy: { created_at: 'desc' }, take: 5 },
      },
      orderBy: { allocated_at: 'desc' },
      take: filters.limit || 50,
    })
    return rows.map(row => ({
      id: row.id,
      status: row.status,
      allocated_at: row.allocated_at,
      contacted_at: row.contacted_at,
      lead_id: row.lead_id,
      prospect: {
        name: row.candidate.comment.author_name,
        handle: row.candidate.comment.author_handle,
        profile_url:
          row.candidate.profile_url || row.candidate.comment.author_profile_url,
        phone: row.candidate.phone_normalized,
      },
      channel: row.candidate.channel,
      location_state: row.candidate.location_state,
      intent_score: row.candidate.intent_score,
      intent_reason: row.candidate.intent_reason,
      dm_script: row.candidate.dm_script,
      whatsapp_script: row.candidate.whatsapp_script,
      comment: row.candidate.comment.comment_text,
      post: {
        url: row.candidate.comment.post.post_url,
        caption: row.candidate.comment.post.caption,
        property_type: row.candidate.comment.post.property_type,
        specific_location: row.candidate.comment.post.specific_location,
        published_at: row.candidate.comment.post.published_at,
      },
      events: row.events,
    }))
  }

  async usage(companyId: number) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const settings = await this.getSettings(companyId)
    const sent = await this.prisma.buyer_finder_outreach_events.count({
      where: {
        allocation: { company_id: companyId },
        action: { in: ['whatsapp_opened', 'contacted'] },
        created_at: { gte: start },
      },
    })
    return {
      used: sent,
      limit: settings.daily_outreach_limit,
      remaining: Math.max(0, settings.daily_outreach_limit - sent),
    }
  }

  async recordAction(
    companyId: number,
    allocationId: number,
    input: { action: string; script?: string },
  ) {
    const allocation = await this.prisma.buyer_finder_allocations.findFirst({
      where: { id: allocationId, company_id: companyId },
      include: { candidate: true },
    })
    if (!allocation) throw new NotFoundException('Buyer Finder lead not found')
    if (
      allocation.status === 'shadow' &&
      ['whatsapp_opened', 'contacted'].includes(input.action)
    ) {
      throw new BadRequestException(
        'Outreach is disabled while Buyer Finder is in shadow mode',
      )
    }

    const now = new Date()
    const allocationUpdate =
      input.action === 'contacted'
        ? { status: 'contacted', contacted_at: now }
        : input.action === 'dismissed'
          ? { status: 'dismissed', dismissed_at: now }
          : input.action === 'do_not_contact'
            ? { status: 'suppressed', dismissed_at: now }
            : null

    const operations: any[] = [
      this.prisma.buyer_finder_outreach_events.create({
        data: {
          allocation_id: allocation.id,
          action: input.action,
          channel: allocation.candidate.channel,
          script: input.script?.trim() || null,
        },
      }),
    ]
    if (allocationUpdate) {
      operations.push(
        this.prisma.buyer_finder_allocations.update({
          where: { id: allocation.id },
          data: allocationUpdate,
        }),
      )
    }
    if (allocation.lead_id && input.action === 'contacted') {
      operations.push(
        this.prisma.leads.update({
          where: { id: allocation.lead_id },
          data: { status: 'contacted', last_contact_at: now },
        }),
      )
    }
    await this.prisma.$transaction(operations)
    return {
      success: true,
      status: allocationUpdate?.status || allocation.status,
    }
  }
}
