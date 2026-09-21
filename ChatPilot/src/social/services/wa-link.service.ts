import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { socialConfig } from '../social.config'

@Injectable()
export class WaLinkService {
  generateRefCode(): string {
    return randomBytes(5).toString('hex').toUpperCase().slice(0, 8)
  }

  resolveDigits(company: {
    phone: bigint
    wa_inbound_phone?: bigint | null
  }): string | null {
    const digits = String(company.wa_inbound_phone ?? company.phone)
    return /^\d{7,15}$/.test(digits) ? digits : null
  }

  build(
    company: {
      name: string
      phone: bigint
      wa_inbound_phone?: bigint | null
      social_reply_template?: string | null
    },
    platform: string,
    refCode: string,
  ): string | null {
    const digits = this.resolveDigits(company)
    if (!digits) return null

    const template =
      company.social_reply_template || socialConfig.waPrefillTemplate

    const prefill = template
      .replace('{company}', company.name)
      .replace(
        '{platform}',
        platform === 'instagram' ? 'Instagram' : 'Facebook',
      )
      .replace('{ref}', refCode)

    return `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}`
  }
}
