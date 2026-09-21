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

  if (budget) {
    return `${greeting} I’ve noted your ${budget} budget. What property type and location are you considering?`
  }

  if (
    /\b(price|cost|how much|property|listing|house|land|duplex|flat)\b/i.test(
      message,
    )
  ) {
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
    return `${greeting} What day and time would you prefer for the inspection? I’ll keep that request for confirmation.`
  }

  if (/\b(yes|share|send|details|okay|ok|please|pls)\b/i.test(message)) {
    return `${greeting} Tell me the property name or preferred location so I can match the right details to your request.`
  }

  return `${greeting} I’ve saved your message. Please share the property type, preferred location, and budget so we can continue without losing your request.`
}
