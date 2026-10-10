import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

export type CreateNotificationInput = {
  companyId: number
  type: string
  title: string
  message: string
  severity?: 'info' | 'success' | 'warning' | 'error'
  entity?: string
  entityId?: string | number
  dedupeKey?: string
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    const data = {
      company_id: input.companyId,
      type: input.type.slice(0, 40),
      severity: input.severity || 'info',
      title: input.title.slice(0, 160),
      message: input.message.slice(0, 2000),
      entity: input.entity?.slice(0, 40) || null,
      entity_id:
        input.entityId === undefined
          ? null
          : String(input.entityId).slice(0, 80),
      dedupe_key: input.dedupeKey?.slice(0, 160) || null,
    }

    try {
      if (data.dedupe_key) {
        return await this.prisma.notifications.upsert({
          where: {
            company_id_dedupe_key: {
              company_id: input.companyId,
              dedupe_key: data.dedupe_key,
            },
          },
          create: data,
          update: {},
        })
      }
      return await this.prisma.notifications.create({ data })
    } catch (error) {
      this.logger.warn(`Could not create notification: ${error?.message}`)
      return null
    }
  }

  async list(companyId: number, take = 30) {
    const limit = Math.max(1, Math.min(100, take))
    const [items, unread] = await Promise.all([
      this.prisma.notifications.findMany({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: limit,
      }),
      this.prisma.notifications.count({
        where: { company_id: companyId, read_at: null },
      }),
    ])
    return { items, unread }
  }

  async markRead(companyId: number, notificationId: number) {
    await this.prisma.notifications.updateMany({
      where: { id: notificationId, company_id: companyId, read_at: null },
      data: { read_at: new Date() },
    })
    return { success: true }
  }

  async markAllRead(companyId: number) {
    await this.prisma.notifications.updateMany({
      where: { company_id: companyId, read_at: null },
      data: { read_at: new Date() },
    })
    return { success: true }
  }
}
