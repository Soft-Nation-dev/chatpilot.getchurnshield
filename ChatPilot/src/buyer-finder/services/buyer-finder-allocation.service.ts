import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { NotificationsService } from '../../notifications/notifications.service'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class BuyerFinderAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async allocate(candidateId: number): Promise<number> {
    const result = await this.prisma.$transaction(
      async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${candidateId})`

        const candidate = await tx.buyer_finder_candidates.findUnique({
          where: { id: candidateId },
          include: {
            comment: { include: { post: { include: { account: true } } } },
          },
        })
        if (!candidate?.is_high_intent || !candidate.location_state) {
          return { candidate: null, allocations: [] }
        }

        const sourceCompanyId =
          candidate.comment.post.account?.company_id || null
        const settings = await tx.buyer_finder_settings.findMany({
          where: {
            enabled: true,
            min_intent_score: { lte: candidate.intent_score },
            target_states: { has: candidate.location_state },
            ...(sourceCompanyId ? { company_id: sourceCompanyId } : {}),
            company: {
              account_status: 'active',
              ...(!sourceCompanyId
                ? {
                    buyer_finder_accounts: {
                      none: { source: 'connected_social', status: 'active' },
                    },
                  }
                : {}),
            },
          },
          include: {
            company: { select: { id: true, name: true } },
          },
          orderBy: { company_id: 'asc' },
        })
        if (!settings.length) return { candidate, allocations: [] }

        const existing = await tx.buyer_finder_allocations.findMany({
          where: {
            candidate_id: candidate.id,
            company_id: { in: settings.map(row => row.company_id) },
          },
          select: { company_id: true },
        })
        const existingCompanyIds = new Set(existing.map(row => row.company_id))
        const available = settings.filter(
          setting => !existingCompanyIds.has(setting.company_id),
        )
        if (!available.length) return { candidate, allocations: [] }

        const counts = await tx.buyer_finder_allocations.groupBy({
          by: ['company_id'],
          where: { company_id: { in: available.map(row => row.company_id) } },
          _count: { _all: true },
        })
        const byCompany = new Map(
          counts.map(row => [row.company_id, row._count._all]),
        )
        const ordered = [...available].sort((a, b) => {
          const countDifference =
            (byCompany.get(a.company_id) || 0) -
            (byCompany.get(b.company_id) || 0)
          return countDifference || a.company_id - b.company_id
        })
        const maximumRecipients = sourceCompanyId
          ? 1
          : Math.min(
              2,
              Math.max(1, ...ordered.map(row => row.exclusivity_limit)),
            )

        const allocations: Array<{
          id: number
          companyId: number
          companyName: string
          status: string
        }> = []
        for (const setting of ordered.slice(0, maximumRecipients)) {
          const status = setting.shadow_mode ? 'shadow' : 'allocated'
          const leadId = setting.shadow_mode
            ? null
            : await this.materializeLead(tx, setting.company_id, candidate)
          const allocation = await tx.buyer_finder_allocations.create({
            data: {
              candidate_id: candidate.id,
              company_id: setting.company_id,
              lead_id: leadId,
              status,
            },
          })
          allocations.push({
            id: allocation.id,
            companyId: setting.company_id,
            companyName: setting.company.name,
            status,
          })
        }
        return { candidate, allocations }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 20_000,
      },
    )

    if (!result.candidate) return 0
    for (const allocation of result.allocations) {
      await this.notifications.create({
        companyId: allocation.companyId,
        type: 'buyer_finder_match',
        severity: 'success',
        title: 'New high-intent buyer found',
        message: `${result.candidate.comment.author_name || 'A prospect'} scored ${result.candidate.intent_score}/10 for ${result.candidate.location_state}. Review the enquiry in Buyer Finder.`,
        entity: 'buyer_finder',
        entityId: allocation.id,
        dedupeKey: `buyer-finder-allocation-${allocation.id}`,
      })
    }
    return result.allocations.length
  }

  private async materializeLead(
    tx: Prisma.TransactionClient,
    companyId: number,
    candidate: any,
  ) {
    const existing = candidate.phone_normalized
      ? await tx.leads.findFirst({
          where: { company_id: companyId, phone: candidate.phone_normalized },
          select: { id: true },
        })
      : await tx.leads.findFirst({
          where: {
            company_id: companyId,
            source: 'buyer_finder',
            source_id: String(candidate.id),
          },
          select: { id: true },
        })
    if (existing) return existing.id

    const lead = await tx.leads.create({
      data: {
        company_id: companyId,
        name: candidate.comment.author_name,
        phone: candidate.phone_normalized,
        website: candidate.profile_url || candidate.comment.author_profile_url,
        source: 'buyer_finder',
        source_id: String(candidate.id),
        raw_text: candidate.comment.comment_text,
        location_state: candidate.location_state,
        status: 'qualified',
        qual_score: candidate.intent_score / 10,
        notes: candidate.intent_reason || 'High-intent social buyer',
      },
    })
    return lead.id
  }
}
