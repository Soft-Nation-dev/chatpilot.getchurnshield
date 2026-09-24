export const CONTENT_KINDS = [
  'showcase',
  'profile',
  'educational',
  'tip',
  'faq',
  'myth_buster',
  'process',
  'area_guide',
] as const

export const CONTENT_SYSTEM_PROMPT = `You write social media posts for a Nigerian real estate agency, for Facebook and Instagram.

Your job is to build TRUST and EDUCATE. Nigerian property buyers are afraid of being scammed — of buying land under government acquisition, of family land being resold, of paying and never getting allocation. Content that calmly explains how these things actually work outperforms hype every single time.

VOICE
- Warm, confident, plain Nigerian English. Never stiff or corporate.
- Short lines. Generous line breaks. Easy to read on a phone.
- Light emoji use — two or three per post at most, never a wall of them.
- Speak to one person ("you"), never "dear clients".

HARD RULES
- NEVER invent a price, plot size, title status, estate name or availability. Use ONLY the property details supplied to you. If a detail is missing, simply do not mention it.
- Never promise returns, appreciation percentages or guaranteed resale value.
- Never claim land is excised, gazetted or free from acquisition unless the supplied details say so explicitly.
- Do not use the words "guaranteed", "risk-free", "double your money", or "100% safe".
- No hashtag spam. Five to eight relevant hashtags maximum.

CALL TO ACTION
Every post must end by inviting the reader to comment or message. Prefer inviting a COMMENT (for example "Comment PRICE and I'll send you the details") because comments are what our system replies to automatically.

OUTPUT
Respond with STRICT JSON only. No markdown fences, no commentary:
{"caption":"the full post text including the call to action","hashtags":"#tag1 #tag2 #tag3"}`

export const KIND_BRIEFS: Record<string, string> = {
  showcase:
    'Write a property showcase. Lead with the single most compelling detail (the location, the title document, or the payment plan). Describe what life there is actually like, not just a list of specs. Close by inviting a comment for the price and full details.',
  profile:
    'Write a brand-building post using the agency profile below. Help a prospective buyer understand what the agency does, who it serves, or why its approach is useful. Do not invent achievements, locations, services, years of experience, or guarantees. Close with a natural invitation to ask a question.',
  educational:
    'Write an educational post that teaches buyers something genuinely useful about buying property in Nigeria — how a title document actually protects them, what to check before paying, how allocation works. Do NOT pitch a property. Teach first. Close by inviting questions in the comments.',
  tip: 'Write one short, sharp practical tip a Nigerian property buyer can act on today. One idea only. Keep it under 80 words.',
  faq: 'Answer one real question Nigerian property buyers ask, in plain language. State the question, then answer it honestly, including any caveat. Close by inviting more questions.',
  myth_buster:
    'Take one common and costly misconception Nigerian property buyers hold, state it plainly, then correct it with the facts. Be respectful — never make the reader feel stupid for believing it.',
  process:
    'Walk the reader through one stage of the buying process step by step, so it feels less intimidating. Be concrete about what happens and roughly how long it takes.',
  area_guide:
    'Write about a specific Nigerian area or growth corridor — what is driving it, who it suits, what to watch out for. Be balanced; mention a genuine drawback as well as the upside. That honesty is what builds trust.',
}

export const EDUCATIONAL_TOPICS = [
  'What a Certificate of Occupancy actually protects you from',
  "Why Governor's Consent matters when you buy land from another buyer",
  'Excision and gazette explained in plain English',
  'How to check if land is under government acquisition before you pay',
  'What a registered survey plan tells you that photos never will',
  'Family land and omonile levies — what to ask before you pay a kobo',
  'What actually happens between full payment and allocation',
  'Deed of Assignment: what you should be handed and when',
  'Questions to ask on a site inspection that most buyers forget',
  'Why the cheapest plot in an area is usually the most expensive mistake',
  'Outright payment vs installment: which one actually suits you',
  'The extra costs beyond the land price nobody warns first-time buyers about',
  'How to verify an agency before you send money',
  'Dry land vs waterlogged land — how to tell on inspection',
  'What to do if a seller cannot produce the original documents',
]

export function buildContentUserPrompt(input: {
  kind: string
  companyName: string
  property?: {
    title: string
    description?: string | null
    property_type?: string | null
    location?: string | null
    state?: string | null
    price?: bigint | null
    price_max?: bigint | null
    currency?: string | null
    size_sqm?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    title_document?: string | null
    payment_plan?: string | null
    features?: string | null
  } | null
  topic?: string | null
  learned?: string | null
  businessProfile?: string | null
  recentCaptions?: string[]
  mediaContext?: string | null
}): string {
  const brief = KIND_BRIEFS[input.kind] ?? KIND_BRIEFS.educational
  const lines: string[] = [
    `Agency: ${input.companyName}`,
    '',
    `Brief: ${brief}`,
  ]

  if (input.topic) {
    lines.push('', `Topic: ${input.topic}`)
  }

  if (input.businessProfile) {
    lines.push(
      '',
      'Agency profile — use only these supplied facts when describing the business:',
      input.businessProfile,
    )
  }

  if (input.property) {
    const p = input.property
    const facts: string[] = []
    const add = (label: string, value: any) => {
      if (value !== null && value !== undefined && `${value}`.trim() !== '') {
        facts.push(`- ${label}: ${value}`)
      }
    }
    add('Name', p.title)
    add('Type', p.property_type)
    add('Location', p.location)
    add('State', p.state)
    if (p.price != null) {
      const currency = p.currency || 'NGN'
      add(
        'Price',
        p.price_max != null && p.price_max !== p.price
          ? `${currency} ${p.price} to ${p.price_max}`
          : `${currency} ${p.price}`,
      )
    }
    add('Size (sqm)', p.size_sqm)
    add('Bedrooms', p.bedrooms)
    add('Bathrooms', p.bathrooms)
    add('Title document', p.title_document)
    add('Payment plan', p.payment_plan)
    add('Features', p.features)
    add('Description', p.description)

    lines.push(
      '',
      'Property details — these are the ONLY facts you may state about this property:',
      facts.join('\n'),
    )
  }

  if (input.learned) {
    lines.push(
      '',
      'What has worked with this audience before (apply it):',
      input.learned,
    )
  }

  if (input.mediaContext) {
    lines.push('', 'Selected visual:', input.mediaContext)
  }

  if (input.recentCaptions?.length) {
    lines.push(
      '',
      'Recent posts — do not repeat their hook, wording, angle, or call to action:',
      input.recentCaptions.map((caption, index) => `${index + 1}. ${caption.slice(0, 300)}`).join('\n'),
    )
  }

  return lines.join('\n')
}
