import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LeadsService } from '../leads/services/leads.service'

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
  ) {}

  async listCompanies() {
    const companies = await this.prisma.companies.findMany({
      orderBy: { id: 'asc' },
    })
    const rows: any[] = []
    for (const c of companies) {
      const usage = await this.leadsService.monthlyUsage(c.id)
      const total = await this.prisma.leads.count({
        where: { company_id: c.id },
      })
      rows.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        monthly_lead_quota: usage.quota,
        daily_lead_limit: usage.daily_limit,
        pool_cursor: c.pool_cursor,
        monthly_used: usage.used,
        daily_used: usage.daily_used,
        total_leads: total,
      })
    }
    return rows
  }

  async setLimits(
    companyId: number,
    body: { monthly_lead_quota?: number; daily_lead_limit?: number },
  ) {
    const data: any = {}
    if (
      body.monthly_lead_quota !== undefined &&
      body.monthly_lead_quota !== null
    ) {
      data.monthly_lead_quota = Math.max(
        0,
        Math.floor(Number(body.monthly_lead_quota)) || 0,
      )
    }
    if (body.daily_lead_limit !== undefined && body.daily_lead_limit !== null) {
      data.daily_lead_limit = Math.max(
        0,
        Math.floor(Number(body.daily_lead_limit)) || 0,
      )
    }
    return this.prisma.companies.update({ where: { id: companyId }, data })
  }

  async assign(companyId: number, count: number) {
    return this.leadsService.requestLeads(
      companyId,
      Math.max(1, Math.floor(Number(count)) || 1),
    )
  }

  async poolStats() {
    return this.leadsService.poolStats()
  }

  async harvestPool(count: number) {
    return this.leadsService.harvestPool(
      Math.max(1, Math.floor(Number(count)) || 1),
    )
  }
}
