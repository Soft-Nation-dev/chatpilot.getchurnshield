import { Contact } from 'src/utils/constants/types'

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function budgetFromMessage(message: string): string | null {
  const match = message.match(
    /(?:₦|ngn\s*)?([0-9]+(?:\.[0-9]+)?)\s*(billion|million|thousand|bn|m|k)\b/i,
  )
  if (!match) return null
  const number = Number(match[1])
  if (!Number.isFinite(number)) return null
  const unit = match[2].toLowerCase()
  const multiplier =
    unit === 'billion' || unit === 'bn'
      ? 1_000_000_000
      : unit === 'million' || unit === 'm'
        ? 1_000_000
        : 1_000
  const amount = number * multiplier
  return `₦${new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 0,
  }).format(amount)}`
}

export function buildDegradedReply(contact: Contact, rawMessage: string) {
  const message = normalizeText(rawMessage)
  const budget = budgetFromMessage(message)
  const firstName = contact.name?.trim().split(/\s+/)[0]
  const greeting = firstName ? `Thanks, ${firstName}.` : 'Thanks.'
  const inspection = (contact as any).conversation_state?.inspection as
    | {
        status?: string
        propertyTitle?: string
        requestedDay?: string
        requestedTime?: string
      }
    | undefined

  if (inspection?.status === 'awaiting_human') {
    return `I have your inspection request${
      inspection.propertyTitle ? ` for ${inspection.propertyTitle}` : ''
    }${inspection.requestedDay ? ` on ${inspection.requestedDay}` : ''}. Our team is confirming the available time and will get back to you shortly.`
  }

  if (inspection?.status === 'booked') {
    return `Your inspection${
      inspection.propertyTitle ? ` for ${inspection.propertyTitle}` : ''
    } is already booked. If anything changes, just let me know.`
  }

  if (inspection?.requestedDay && !inspection.requestedTime) {
    return `${inspection.requestedDay} is noted${
      inspection.propertyTitle ? ` for ${inspection.propertyTitle}` : ''
    }. What time on ${inspection.requestedDay} works best for you?`
  }

  if (budget) {
    return `${greeting} I’ve noted your ${budget} budget. What property type and location are you considering?`
  }

  if (
    /\b(price|cost|how much|property|listing|house|land|duplex|flat)\b/i.test(
      message,
    )
  ) {
    if (inspection?.propertyTitle) {
      return `${greeting} I have ${inspection.propertyTitle} noted. What detail would you like me to clarify?`
    }
    const knownPreference = [contact.property_type, contact.preferred_location]
      .filter(Boolean)
      .join(' in ')
    return knownPreference
      ? `${greeting} I have your interest in ${knownPreference}. Which specific listing would you like details about?`
      : `${greeting} Which property or location would you like the price and details for?`
  }

  if (
    /\b(appointment|inspection|viewing|schedule|book|slot|visit)\b/i.test(
      message,
    )
  ) {
    return inspection?.requestedDay
      ? `${inspection.requestedDay} is noted${
          inspection.propertyTitle ? ` for ${inspection.propertyTitle}` : ''
        }. What time works best for you?`
      : `${greeting} Which day works best for the inspection?`
  }

  if (/\b(yes|share|send|details|okay|ok|please|pls)\b/i.test(message)) {
    return `${greeting} Tell me the property name or preferred location so I can match the right details to your request.`
  }

  return `${greeting} I’ve saved your message. Please share the property type, preferred location, and budget so we can continue without losing your request.`
}
