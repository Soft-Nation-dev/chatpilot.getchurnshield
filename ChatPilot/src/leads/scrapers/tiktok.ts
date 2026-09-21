import { scraperConfig as config } from './scraper-config'
import { log } from './logger'
import { runActor } from './apify-client'
import {
  extractPhone,
  extractEmail,
  mentionsNigeria,
  normalizeUrl,
} from './extract'
import { parseState } from './location'
import type { RawLead } from './types'

const logger = log('scraper:tiktok')

interface TtItem {
  id?: string
  text?: string
  error?: string
  authorMeta?: {
    id?: string
    name?: string
    nickName?: string
    signature?: string
    bioLink?: string
  }
}

export async function scrapeTiktok(count: number): Promise<RawLead[]> {
  const items = await runActor<TtItem>(config.apify.tiktokActor, {
    searchQueries: config.apify.searchQueries,
    searchSection: '/user',
    maxProfilesPerQuery: count,
    resultsPerPage: 5,
    scrapeAdditionalAuthorMeta: true,
    commentsPerPost: 0,
    proxyCountryCode: 'NG',
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    shouldDownloadSlideshowImages: false,
  })

  const seen = new Set<string>()
  const leads: RawLead[] = []

  for (const item of Array.isArray(items) ? items : []) {
    const a = item?.authorMeta
    if (!a || !a.id) continue
    if (seen.has(a.id)) continue
    seen.add(a.id)

    const sig = a.signature || ''
    const text = item.text || ''
    const phone = extractPhone(sig, text)
    if (!phone && !mentionsNigeria(sig, text)) continue

    leads.push({
      source: 'tiktok',
      sourceId: `tiktok-${a.id}`,
      name: a.nickName || a.name || null,
      phone,
      email: extractEmail(sig, text),
      website: normalizeUrl(a.bioLink),
      address: null,
      handle: a.name ? `@${a.name}` : null,
      rawText: [sig, text].filter(Boolean).join('\n').slice(0, 1000) || null,
      category: 'Buyer',
      locationPref: parseState(`${sig} ${text}`) || config.apify.location,
    })
  }

  logger.info(
    { leads: leads.length, withPhone: leads.filter(l => l.phone).length },
    'TikTok scrape complete',
  )
  return leads
}
