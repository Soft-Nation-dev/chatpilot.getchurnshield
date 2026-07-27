import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  decryptMessage,
  encryptMessage,
} from 'src/common/crypto/message-crypto'

@Injectable()
export class SocialAccountService {
  private readonly logger = new Logger(SocialAccountService.name)

  constructor(private readonly prisma: PrismaService) {}

  async resolveByExternalId(accountExternalId: string) {
    return this.prisma.social_accounts.findFirst({
      where: { external_id: accountExternalId, is_active: true },
      include: { company: true },
    })
  }

  async listForCompany(companyId: number) {
    return this.prisma.social_accounts.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        platform: true,
        external_id: true,
        page_id: true,
        ig_user_id: true,
        name: true,
        username: true,
        is_active: true,
        subscribed_at: true,
        token_expires_at: true,
        last_error: true,
        created_at: true,
      },
      orderBy: { id: 'asc' },
    })
  }

  async externalIdsForCompany(companyId: number): Promise<Set<string>> {
    const rows = await this.prisma.social_accounts.findMany({
      where: { company_id: companyId },
      select: { external_id: true, page_id: true, ig_user_id: true },
    })
    const ids = new Set<string>()
    for (const row of rows) {
      if (row.external_id) ids.add(row.external_id)
      if (row.page_id) ids.add(row.page_id)
      if (row.ig_user_id) ids.add(row.ig_user_id)
    }
    return ids
  }

  async upsert(data: {
    companyId: number
    platform: string
    externalId: string
    pageId?: string | null
    igUserId?: string | null
    name?: string | null
    username?: string | null
    accessToken: string
    tokenExpiresAt?: Date | null
    scopes?: string | null
  }) {
    const payload = {
      company_id: data.companyId,
      page_id: data.pageId ?? null,
      ig_user_id: data.igUserId ?? null,
      name: data.name ?? null,
      username: data.username ?? null,
      access_token: encryptMessage(data.accessToken),
      token_expires_at: data.tokenExpiresAt ?? null,
      scopes: data.scopes ?? null,
      is_active: true,
      last_error: null,
    }

    return this.prisma.social_accounts.upsert({
      where: {
        platform_external_id: {
          platform: data.platform,
          external_id: data.externalId,
        },
      },
      create: {
        platform: data.platform,
        external_id: data.externalId,
        ...payload,
      },
      update: payload,
    })
  }

  token(account: { access_token: string }): string {
    return decryptMessage(account.access_token)
  }

  async markSubscribed(id: number) {
    return this.prisma.social_accounts.update({
      where: { id },
      data: { subscribed_at: new Date() },
    })
  }

  async deactivate(id: number, reason: string | null = null) {
    return this.prisma.social_accounts.update({
      where: { id },
      data: { is_active: false, last_error: reason },
    })
  }

  async recordError(id: number, reason: string) {
    try {
      await this.prisma.social_accounts.update({
        where: { id },
        data: { last_error: reason.slice(0, 1000) },
      })
    } catch (error) {
      this.logger.error('Failed to record account error', error?.message)
    }
  }
}
