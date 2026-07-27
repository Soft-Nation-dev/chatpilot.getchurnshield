export const SOCIAL_PLATFORM = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
} as const

export const SOCIAL_EVENT_TYPE = {
  COMMENT: 'comment',
  DM: 'dm',
} as const

export const SOCIAL_ACTION = {
  RECEIVED: 'received',
  REPLIED: 'replied',
  CONVERTED: 'converted',
  SKIPPED_LOW_INTENT: 'skipped_low_intent',
  SKIPPED_DISABLED: 'skipped_disabled',
  SKIPPED_RATE_LIMITED: 'skipped_rate_limited',
  SKIPPED_BAD_PHONE: 'skipped_bad_phone',
  SKIPPED_DUPLICATE_AUTHOR: 'skipped_duplicate_author',
  UNKNOWN_ACCOUNT: 'unknown_account',
  FAILED: 'failed',
} as const

export const PRAISE_ONLY = [
  'nice',
  'wow',
  'lovely',
  'beautiful',
  'great',
  'good',
  'cool',
  'amazing',
  'god bless',
  'amen',
  'congrats',
  'congratulations',
  'following',
  'follow',
  'ok',
  'okay',
  'noted',
  'thanks',
  'thank you',
]

export const PRICE_PATTERN =
  /how much|price|pricing|cost|rate|₦|naira|\bngn\b|million|billion|\bbudget\b|installment|instalment|payment plan|down ?payment|deposit|afford/i

export const INTEREST_PATTERN =
  /still available|available\?|is it available|interested|i want|i need|i dey find|dm me|inbox|send details|send me|more info|information|how do i|where is it|where is this|location|address|inspection|inspect|survey|c of o|certificate of occupancy|governor'?s consent|gazette|excision|excised|deed|allocation|\bplot\b|\bland\b|\bsqm\b|square met|title|documents?/i

export const PIDGIN_PATTERN =
  /\babeg\b|\bwetin\b|how far|na how much|\be get\b|make i|i wan\b|how you dey|shey/i

export const COMMENT_REPLY_TEMPLATES = [
  'Hi {name} 👋 Full details, price and inspection dates are on WhatsApp: {link}',
  'Hey {name}! We have the pricing and video tour ready for you here: {link}',
  'Hello {name} 👋 Tap here to get the full details and pricing on WhatsApp: {link}',
  'Hi {name}! Everything you asked about is on WhatsApp — price, location and inspection: {link}',
]

export const DM_REPLY_TEMPLATE =
  'Hi {name} 👋 Thanks for reaching out! Our team has the full pricing, layout and inspection dates ready. Tap here to continue on WhatsApp and we will send everything across: {link}'
