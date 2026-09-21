import * as cheerio from 'cheerio'
import { scraperConfig as config } from './scraper-config'
import { log } from './logger'
import { fetchHtml } from './http'
import { extractPhone, extractEmail } from './extract'
import { parseState } from './location'
import type { RawLead } from './types'

const logger = log('scraper:nairaland')
const BUYER_HINT =
  /wanted|looking for|need|buy|for sale|land|plot|acre|hectare|apartment|flat|bedroom/i

export async function scrapeNairaland(count: number): Promise<RawLead[]> {
  const leads: RawLead[] = []
  try {
    const boardHtml = await fetchHtml(config.sources.nairalandUrl)
    const $ = cheerio.load(boardHtml)

    const topics: { url: string; title: string }[] = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      const title = $(el).text().trim()
      if (
        /^\/\d+\/[a-z0-9-]+/i.test(href) &&
        title.length > 12 &&
        BUYER_HINT.test(title)
      ) {
        topics.push({
          url: href.startsWith('http')
            ? href
            : `https://www.nairaland.com${href}`,
          title,
        })
      }
    })

    const seen = new Set<string>()
    for (const t of topics) {
      if (leads.length >= count) break
      if (seen.has(t.url)) continue
      seen.add(t.url)

      let body = t.title
      let author: string | null = null
      try {
        const threadHtml = await fetchHtml(t.url)
        const $$ = cheerio.load(threadHtml)
        const post = $$('div.narrow').first().text().replace(/\s+/g, ' ').trim()
        if (post) body = `${t.title} ${post}`
        author = $$('a[href^="/"] b').first().text().trim() || null
      } catch {
        author = null
      }

      leads.push({
        source: 'nairaland',
        sourceId: `nairaland-${t.url}`,
        name: author,
        phone: extractPhone(body),
        email: extractEmail(body),
        website: null,
        address: null,
        handle: t.url,
        rawText: body.slice(0, 1200),
        category: 'Buyer',
        locationPref: parseState(body) || config.apify.location,
      })
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Nairaland fetch failed',
    )
  }
  logger.info(
    { leads: leads.length, withPhone: leads.filter(l => l.phone).length },
    'Nairaland scrape complete',
  )
  return leads
}
