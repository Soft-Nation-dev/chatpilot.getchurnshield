import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class BuyerFinderAllocationService {
  private readonly logger = new Logger(BuyerFinderAllocationService.name)

  constructor(private readonly prisma: PrismaService) {}

  async allocate(candidateId: number): Promise<number> {
    const candidate = await this.prisma.buyer_finder_candidates.findUnique({
      where: { id: candidateId },
      include: { comment: true },
    })
    if (!candidate?.is_high_intent || !candidate.location_state) return 0

    const settings = await this.prisma.buyer_finder_settings.findMany({
      where: {
        enabled: true,
        target_states: { has: candidate.location_state },
        company: { account_status: 'active' },
      },
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { company_id: 'asc' },
    })
    if (!settings.length) return 0

    const counts = await this.prisma.buyer_finder_allocations.groupBy({
      by: ['company_id'],
      where: { company_id: { in: settings.map(row => row.company_id) } },
      _count: { _all: true },
    })
    const byCompany = new Map(
      counts.map(row => [row.company_id, row._count._all]),
    )
    const ordered = [...settings].sort((a, b) => {
      const countDifference =
        (byCompany.get(a.company_id) || 0) - (byCompany.get(b.company_id) || 0)
      return countDifference || a.company_id - b.company_id
    })
    const maximumRecipients = Math.min(
      2,
      Math.max(1, ...ordered.map(row => row.exclusivity_limit)),
    )

    let created = 0
    for (const setting of ordered.slice(0, maximumRecipients)) {
      const status = setting.shadow_mode ? 'shadow' : 'allocated'
      let leadId: number | null = null
      if (!setting.shadow_mode) {
        leadId = await this.materializeLead(setting.company_id, candidate)
      }
      try {
        await this.prisma.buyer_finder_allocations.create({
          data: {
            candidate_id: candidate.id,
            company_id: setting.company_id,
            lead_id: leadId,
            status,
          },
        })
        created += 1
      } catch {
        this.logger.debug(
          `Candidate ${candidate.id} was already allocated to company ${setting.company_id}`,
        )
      }
    }
    return created
  }

  private async materializeLead(companyId: number, candidate: any) {
    const existing = candidate.phone_normalized
      ? await this.prisma.leads.findFirst({
          where: { company_id: companyId, phone: candidate.phone_normalized },
          select: { id: true },
        })
      : await this.prisma.leads.findFirst({
          where: {
            company_id: companyId,
            source: 'buyer_finder',
            source_id: String(candidate.id),
          },
          select: { id: true },
        })
    if (existing) return existing.id

    const lead = await this.prisma.leads.create({
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
