import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { SOCIAL_ACTION } from '../constants/social.constants'

const REF_PATTERN = /\[([A-Z0-9]{6,10})\]/i

@Injectable()
export class SocialAttributionService {
  private readonly logger = new Logger(SocialAttributionService.name)

  constructor(private readonly prisma: PrismaService) {}

  async attachIfSocialRef(
    contact: { id: number; company_id: number | null; source?: string | null },
    message: string,
  ): Promise<void> {
    const match = REF_PATTERN.exec(message || '')
    if (!match) return
    if (contact.source) return

    const refCode = match[1].toUpperCase()

    const event = await this.prisma.social_events.findUnique({
      where: { ref_code: refCode },
    })

    if (!event) return
    if (event.company_id !== contact.company_id) return

    await this.prisma.contacts.update({
      where: { id: contact.id },
      data: {
        source: `${event.platform}_${event.event_type}`,
        source_ref: refCode,
        social_event_id: event.id,
      },
    })

    await this.prisma.social_events.update({
      where: { id: event.id },
      data: { action: SOCIAL_ACTION.CONVERTED },
    })

    this.logger.log(
      `Attributed contact ${contact.id} to social event ${event.id} (${refCode})`,
    )
  }
}
