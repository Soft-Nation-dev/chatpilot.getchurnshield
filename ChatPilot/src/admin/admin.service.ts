import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { LeadsService } from '../leads/services/leads.service'

const COMPANY_STATUSES = ['active', 'suspended'] as const
const SUBSCRIPTION_STATUSES = [
  'pending',
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
] as const
const USER_STATUSES = ['active', 'invited', 'suspended', 'revoked'] as const
const USER_ROLES = ['owner', 'manager', 'agent'] as const

type CompanyUpdate = {
  name?: string
  email?: string | null
  account_status?: string
  subscription_plan?: string
  subscription_status?: string
  subscription_started_at?: string | null
  subscription_expires_at?: string | null
  suspension_reason?: string | null
  monthly_lead_quota?: number
  daily_lead_limit?: number
  is_bot_activated?: boolean
  social_reply_enabled?: boolean
  timezone?: string
}

type UserUpdate = {
  status?: string
  role?: string
  can_view_contact_phone?: boolean
  full_name?: string | null
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly notifications: NotificationsService,
  ) {}

  async overview() {
    const now = new Date()
    const last30Days = new Date(now.getTime() - 30 * 86400000)
    const last14Days = new Date(now.getTime() - 13 * 86400000)
    last14Days.setUTCHours(0, 0, 0, 0)
    const expiringSoon = new Date(now.getTime() + 7 * 86400000)

    const [
      companies,
      suspendedCompanies,
      users,
      activeUsers,
      contacts,
      recentContacts,
      messages,
      recentMessages,
      properties,
      publishedPosts,
      connectedSocial,
      expiringSubscriptions,
      aiUsage,
      providerUsage,
      activityMessages,
      signupCompanies,
    ] = await Promise.all([
      this.prisma.companies.count(),
      this.prisma.companies.count({ where: { account_status: 'suspended' } }),
      this.prisma.users.count(),
      this.prisma.users.count({ where: { status: 'active' } }),
      this.prisma.contacts.count(),
      this.prisma.contacts.count({
        where: { created_at: { gte: last30Days } },
      }),
      this.prisma.messages.count(),
      this.prisma.messages.count({ where: { sent_at: { gte: last30Days } } }),
      this.prisma.properties.count(),
      this.prisma.content_posts.count({ where: { status: 'published' } }),
      this.prisma.social_accounts.count({ where: { is_active: true } }),
      this.prisma.companies.count({
        where: {
          subscription_expires_at: { gte: now, lte: expiringSoon },
          subscription_status: { in: ['active', 'trialing'] },
        },
      }),
      this.prisma.ai_usage_events.aggregate({
        where: { created_at: { gte: last30Days } },
        _sum: { total_tokens: true, estimated_units: true },
        _count: { _all: true },
      }),
      this.prisma.ai_usage_events.groupBy({
        by: ['provider'],
        where: { created_at: { gte: last30Days } },
        _count: { _all: true },
        _sum: { total_tokens: true, estimated_units: true },
      }),
      this.prisma.messages.findMany({
        where: { sent_at: { gte: last14Days } },
        select: { sent_at: true },
      }),
      this.prisma.companies.findMany({
        where: { created_at: { gte: last14Days } },
        select: { created_at: true },
      }),
    ])

    const daily = new Map<
      string,
      { date: string; messages: number; signups: number }
    >()
    for (let offset = 0; offset < 14; offset++) {
      const date = new Date(last14Days.getTime() + offset * 86400000)
        .toISOString()
        .slice(0, 10)
      daily.set(date, { date, messages: 0, signups: 0 })
    }
    for (const row of activityMessages) {
      if (!row.sent_at) continue
      const point = daily.get(row.sent_at.toISOString().slice(0, 10))
      if (point) point.messages++
    }
    for (const row of signupCompanies) {
      const point = daily.get(row.created_at.toISOString().slice(0, 10))
      if (point) point.signups++
    }

    return {
      totals: {
        companies,
        suspended_companies: suspendedCompanies,
        users,
        active_users: activeUsers,
        contacts,
        messages,
        properties,
        published_posts: publishedPosts,
        connected_social_accounts: connectedSocial,
        expiring_subscriptions: expiringSubscriptions,
      },
      last_30_days: {
        contacts: recentContacts,
        messages: recentMessages,
        ai_requests: aiUsage._count._all,
        ai_tokens: aiUsage._sum.total_tokens || 0,
        ai_estimated_units: aiUsage._sum.estimated_units || 0,
      },
      provider_usage: providerUsage.map(row => ({
        provider: row.provider,
        requests: row._count._all,
        tokens: row._sum.total_tokens || 0,
        estimated_units: row._sum.estimated_units || 0,
      })),
      daily_activity: [...daily.values()],
    }
  }

  async listCompanies(input: { search?: string; status?: string }) {
    const search = input.search?.trim()
    const where: any = {}
    if (input.status && input.status !== 'all') {
      where.account_status = input.status
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const companies = await this.prisma.companies.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        created_at: true,
        updated_at: true,
        name: true,
        phone: true,
        email: true,
        account_status: true,
        subscription_plan: true,
        subscription_status: true,
        subscription_started_at: true,
        subscription_expires_at: true,
        suspended_at: true,
        suspension_reason: true,
        monthly_lead_quota: true,
        daily_lead_limit: true,
        pool_cursor: true,
        is_bot_activated: true,
        social_reply_enabled: true,
        whatsapp_connection_status: true,
        timezone: true,
        _count: {
          select: {
            users: true,
            contacts: true,
            leads: true,
            properties: true,
            content_posts: true,
            company_assets: true,
            social_accounts: true,
          },
        },
      },
    })

    return Promise.all(
      companies.map(async company => {
        const [usage, lastLogin] = await Promise.all([
          this.leadsService.monthlyUsage(company.id),
          this.prisma.users.findFirst({
            where: { company_id: company.id },
            orderBy: { last_login_at: 'desc' },
            select: { last_login_at: true },
          }),
        ])
        return {
          ...company,
          monthly_used: usage.used,
          daily_used: usage.daily_used,
          last_login_at: lastLogin?.last_login_at || null,
        }
      }),
    )
  }

  async companyDetail(companyId: number) {
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        created_at: true,
        updated_at: true,
        name: true,
        phone: true,
        email: true,
        account_status: true,
        subscription_plan: true,
        subscription_status: true,
        subscription_started_at: true,
        subscription_expires_at: true,
        suspended_at: true,
        suspension_reason: true,
        monthly_lead_quota: true,
        daily_lead_limit: true,
        is_bot_activated: true,
        social_reply_enabled: true,
        whatsapp_connection_status: true,
        timezone: true,
        locale: true,
        vertical: true,
        content_automation_settings: true,
        users: {
          select: {
            id: true,
            phone: true,
            full_name: true,
            role: true,
            status: true,
            last_login_at: true,
            created_at: true,
            can_view_contact_phone: true,
          },
          orderBy: { created_at: 'asc' },
        },
        social_accounts: {
          select: {
            id: true,
            platform: true,
            name: true,
            username: true,
            is_active: true,
            subscribed_at: true,
            last_error: true,
            token_expires_at: true,
          },
        },
        _count: {
          select: {
            contacts: true,
            leads: true,
            properties: true,
            content_posts: true,
            company_assets: true,
            notifications: true,
          },
        },
      },
    })
    if (!company) throw new NotFoundException('Company not found')
    return company
  }

  async updateCompany(companyId: number, body: CompanyUpdate, ip?: string) {
    const current = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { id: true, account_status: true },
    })
    if (!current) throw new NotFoundException('Company not found')

    const data: any = {}
    if (body.name !== undefined) {
      data.name = this.requiredText(body.name, 'Company name', 200)
    }
    if (body.email !== undefined) data.email = body.email?.trim() || null
    if (body.account_status !== undefined) {
      this.assertAllowed(
        body.account_status,
        COMPANY_STATUSES,
        'account status',
      )
      data.account_status = body.account_status
      data.suspended_at =
        body.account_status === 'suspended' ? new Date() : null
      if (body.account_status === 'active') data.suspension_reason = null
    }
    if (body.subscription_plan !== undefined) {
      data.subscription_plan = this.requiredText(
        body.subscription_plan,
        'Plan',
        30,
      )
    }
    if (body.subscription_status !== undefined) {
      this.assertAllowed(
        body.subscription_status,
        SUBSCRIPTION_STATUSES,
        'subscription status',
      )
      data.subscription_status = body.subscription_status
      if (
        body.subscription_status === 'active' &&
        body.subscription_started_at === undefined
      ) {
        data.subscription_started_at = new Date()
      }
    }
    if (body.subscription_started_at !== undefined) {
      data.subscription_started_at = this.optionalDate(
        body.subscription_started_at,
        'subscription start',
      )
    }
    if (body.subscription_expires_at !== undefined) {
      data.subscription_expires_at = this.optionalDate(
        body.subscription_expires_at,
        'subscription expiry',
      )
    }
    if (body.suspension_reason !== undefined) {
      data.suspension_reason =
        body.suspension_reason?.trim().slice(0, 1000) || null
    }
    if (body.monthly_lead_quota !== undefined) {
      data.monthly_lead_quota = this.nonNegativeInt(body.monthly_lead_quota)
    }
    if (body.daily_lead_limit !== undefined) {
      data.daily_lead_limit = this.nonNegativeInt(body.daily_lead_limit)
    }
    if (typeof body.is_bot_activated === 'boolean') {
      data.is_bot_activated = body.is_bot_activated
    }
    if (typeof body.social_reply_enabled === 'boolean') {
      data.social_reply_enabled = body.social_reply_enabled
    }
    if (body.timezone !== undefined) {
      data.timezone = body.timezone.trim().slice(0, 60) || null
    }

    const updated = await this.prisma.$transaction(async tx => {
      const company = await tx.companies.update({
        where: { id: companyId },
        data,
      })
      if (
        body.account_status !== undefined &&
        body.account_status !== current.account_status
      ) {
        await tx.users.updateMany({
          where: { company_id: companyId },
          data: { token_version: { increment: 1 } },
        })
      }
      await tx.audit_logs.create({
        data: {
          company_id: companyId,
          action: 'admin.company_updated',
          entity: 'company',
          entity_id: String(companyId),
          meta: { changes: data },
          ip: ip?.slice(0, 45),
        },
      })
      return company
    })

    if (
      body.subscription_expires_at !== undefined ||
      body.subscription_status !== undefined
    ) {
      await this.notifications.create({
        companyId,
        type: 'subscription_updated',
        severity: 'info',
        title: 'Subscription updated',
        message: updated.subscription_expires_at
          ? `Your ${updated.subscription_plan} access is set through ${updated.subscription_expires_at.toLocaleDateString()}.`
          : `Your subscription status is now ${updated.subscription_status}.`,
        entity: 'subscription',
      })
    }
    return this.companyDetail(companyId)
  }

  async listUsers(input: { search?: string; status?: string }) {
    const search = input.search?.trim()
    const where: any = {}
    if (input.status && input.status !== 'all') where.status = input.status
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { full_name: { contains: search, mode: 'insensitive' } },
        { company_name: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }
    return this.prisma.users.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        phone: true,
        full_name: true,
        company_name: true,
        company_id: true,
        role: true,
        status: true,
        can_view_contact_phone: true,
        created_at: true,
        updated_at: true,
        last_login_at: true,
        company: {
          select: {
            name: true,
            account_status: true,
            subscription_expires_at: true,
          },
        },
      },
    })
  }

  async updateUser(userId: number, body: UserUpdate, ip?: string) {
    const target = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, company_id: true, status: true, role: true },
    })
    if (!target) throw new NotFoundException('User not found')
    const data: any = {}
    if (body.status !== undefined) {
      this.assertAllowed(body.status, USER_STATUSES, 'user status')
      data.status = body.status
      if (body.status !== target.status) data.token_version = { increment: 1 }
    }
    if (body.role !== undefined) {
      this.assertAllowed(body.role, USER_ROLES, 'user role')
      data.role = body.role
      if (body.role !== target.role && !data.token_version) {
        data.token_version = { increment: 1 }
      }
    }
    if (typeof body.can_view_contact_phone === 'boolean') {
      data.can_view_contact_phone = body.can_view_contact_phone
    }
    if (body.full_name !== undefined) {
      data.full_name = body.full_name?.trim().slice(0, 160) || null
    }

    const user = await this.prisma.$transaction(async tx => {
      const updated = await tx.users.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          phone: true,
          full_name: true,
          company_id: true,
          role: true,
          status: true,
          can_view_contact_phone: true,
          last_login_at: true,
        },
      })
      await tx.audit_logs.create({
        data: {
          company_id: target.company_id,
          action: 'admin.user_updated',
          entity: 'user',
          entity_id: String(userId),
          meta: { changes: data },
          ip: ip?.slice(0, 45),
        },
      })
      return updated
    })
    return user
  }

  async revokeUserSessions(userId: number, ip?: string) {
    const target = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, company_id: true },
    })
    if (!target) throw new NotFoundException('User not found')
    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: userId },
        data: { token_version: { increment: 1 }, revoked_at: new Date() },
      }),
      this.prisma.audit_logs.create({
        data: {
          company_id: target.company_id,
          action: 'admin.sessions_revoked',
          entity: 'user',
          entity_id: String(userId),
          ip: ip?.slice(0, 45),
        },
      }),
    ])
    return { success: true }
  }

  async auditLog(take = 100) {
    const rows = await this.prisma.audit_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: Math.max(1, Math.min(500, take)),
    })
    const companyIds = [...new Set(rows.map(row => row.company_id))]
    const companies = await this.prisma.companies.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    })
    const names = new Map(companies.map(company => [company.id, company.name]))
    return rows.map(row => ({
      ...row,
      company_name: names.get(row.company_id) || `Company #${row.company_id}`,
    }))
  }

  async setLimits(
    companyId: number,
    body: { monthly_lead_quota?: number; daily_lead_limit?: number },
  ) {
    return this.updateCompany(companyId, body)
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

  private optionalDate(value: string | null, label: string) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${label} date`)
    }
    return date
  }

  private nonNegativeInt(value: number) {
    const parsed = Math.floor(Number(value))
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('Expected a non-negative number')
    }
    return parsed
  }

  private requiredText(value: string, label: string, max: number) {
    const clean = String(value || '').trim()
    if (!clean) throw new BadRequestException(`${label} is required`)
    return clean.slice(0, max)
  }

  private assertAllowed(
    value: string,
    allowed: readonly string[],
    label: string,
  ) {
    if (!allowed.includes(value)) {
      throw new BadRequestException(`Invalid ${label}`)
    }
  }
}
