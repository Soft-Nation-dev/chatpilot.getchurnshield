import { Injectable } from '@nestjs/common'

export type RequestUser = {
  userId: number
  companyId?: number
  role?: string
  canViewContactPhone?: boolean
}

function mask(value: bigint | number | null | undefined): string | null {
  if (value == null) return null
  const digits = value.toString()
  if (digits.length <= 6) return '•'.repeat(digits.length)
  return `${digits.slice(0, 3)}${'•'.repeat(Math.max(0, digits.length - 7))}${digits.slice(-4)}`
}

@Injectable()
export class ContactRedactionService {
  shouldRedact(user: RequestUser | undefined): boolean {
    if (!user) return false
    return user.role === 'agent' && !user.canViewContactPhone
  }

  redactForUser<T extends Record<string, any>>(
    contact: T,
    user: RequestUser | undefined,
  ): T {
    if (!contact || !this.shouldRedact(user)) return contact
    const redacted: Record<string, any> = { ...contact }
    redacted.phone = mask(contact.phone)
    redacted.lid = mask(contact.lid)
    redacted.whatsapp_profile_name = null
    return redacted as T
  }

  redactManyForUser<T extends Record<string, any>>(
    contacts: T[],
    user: RequestUser | undefined,
  ): T[] {
    if (!this.shouldRedact(user)) return contacts
    return contacts.map(c => this.redactForUser(c, user))
  }
}
