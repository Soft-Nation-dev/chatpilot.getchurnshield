import { scraperConfig as config } from './scraper-config'
import { log } from './logger'
import { apifyConfigured } from './apify-client'
import { scrapeFacebook } from './facebook'
import { scrapeTwitter } from './twitter'
import { scrapeInstagram } from './instagram'
import { scrapeTiktok } from './tiktok'
import { scrapeNpc } from './npc'
import { scrapeNairaland } from './nairaland'
import { parseState } from './location'
import type { RawLead } from './types'

const logger = log('scrapers')

type ScraperFn = (count: number) => Promise<RawLead[]>

export const SCRAPERS: Record<string, ScraperFn> = {
  npc: scrapeNpc,
  nairaland: scrapeNairaland,
  facebook: scrapeFacebook,
  twitter: scrapeTwitter,
  instagram: scrapeInstagram,
  tiktok: scrapeTiktok,
}

const NEEDS_APIFY = new Set(['facebook', 'twitter', 'instagram', 'tiktok'])

const MOCK_BUYERS = [
  {
    name: 'Chinedu Okafor',
    text: 'Looking for land to buy in Lekki under 15 million with C of O. Can I inspect this Saturday?',
    phone: '08031234567',
  },
  {
    name: 'Aisha Bello',
    text: 'Need genuine dry land in Ibeju-Lekki, free from acquisition. Please send me pricing brochure and layout.',
    phone: '08129998877',
  },
  {
    name: 'Emeka Nwosu',
    text: 'Any distressed sale in New Haven Enugu? I want to buy and build. Flexible payment plan available?',
    phone: '07066554433',
  },
  {
    name: 'Funke Adeyemi',
    text: 'Looking for genuine developer with gazetted land in Epe. No waterlogged areas please. Is the survey plan verifiable?',
    phone: '08066120934',
  },
  {
    name: 'Ibrahim Musa',
    text: 'Need 1 plot of dry land in Gwarinpa Abuja, must have C of O. Send me video of the site.',
    phone: '08023456781',
  },
  {
    name: 'Ngozi Eze',
    text: 'Is the title on the land C of O or Consent in Ajah? Looking to buy this month.',
    phone: '07033445566',
  },
]

function mockLeads(count: number): RawLead[] {
  const out: RawLead[] = []
  for (let i = 0; i < count; i++) {
    const b = MOCK_BUYERS[i % MOCK_BUYERS.length]
    out.push({
      source: 'mock',
      sourceId: `mock_buyer_${Date.now()}_${i + 1}`,
      name: b.name,
      phone: b.phone,
      email: null,
      website: null,
      address: null,
      handle: null,
      rawText: b.text,
      category: 'Buyer',
      locationPref: parseState(b.text) || 'Nigeria',
    })
  }
  return out
}

export async function runScrapers(
  sources: string[],
  count: number,
): Promise<{ source: string; leads: RawLead[]; error?: string }[]> {
  if (config.apify.useMock) {
    logger.warn({ count }, 'USE_MOCK_SCRAPE=true — using generated mock buyers')
    return [{ source: 'mock', leads: mockLeads(count) }]
  }

  const perSource = Math.max(1, Math.ceil(count / Math.max(sources.length, 1)))
  const results: { source: string; leads: RawLead[]; error?: string }[] = []

  for (const source of sources) {
    const fn = SCRAPERS[source]
    if (!fn) {
      logger.warn({ source }, 'Unknown source — skipping')
      continue
    }
    if (NEEDS_APIFY.has(source) && !apifyConfigured()) {
      logger.warn({ source }, 'Apify token not set — skipping source')
      continue
    }
    try {
      const leads = await fn(perSource)
      results.push({ source, leads })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ source, error: message }, 'Scraper failed')
      results.push({ source, leads: [], error: message })
    }
  }

  return results
}
