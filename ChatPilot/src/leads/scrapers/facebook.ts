import { scraperConfig as config } from './scraper-config'
import { log } from './logger'
import { runActor } from './apify-client'
import { extractPhone, extractEmail } from './extract'
import { parseState } from './location'
import type { RawLead } from './types'

const logger = log('scraper:facebook')

interface FbPost {
  postId?: string
  facebookUrl?: string
  url?: string
  text?: string
  user?: { name?: string; id?: string }
  authorName?: string
  pageName?: string
}

function toLead(item: FbPost): RawLead | null {
  const text = item.text || ''
  if (!text.trim()) return null
  const sourceId = item.postId || item.facebookUrl || item.url
  if (!sourceId) return null

  return {
    source: 'facebook',
    sourceId: `facebook-${sourceId}`,
    name: item.user?.name || item.authorName || item.pageName || null,
    phone: extractPhone(text),
    email: extractEmail(text),
    website: null,
    address: null,
    handle: item.facebookUrl || item.url || null,
    rawText: text.slice(0, 1200),
    category: 'Buyer',
    locationPref: parseState(text) || config.apify.location,
  }
}

export async function scrapeFacebook(count: number): Promise<RawLead[]> {
  const urls = config.apify.fbGroupUrls
  const items = urls.length
    ? await runActor<FbPost>(config.apify.postsActor, {
        startUrls: urls.map(url => ({ url })),
        resultsLimit: count,
        maxPosts: count,
      })
    : await runActor<FbPost>(config.apify.fbSearchActor, {
        searchQueries: config.apify.searchQueries,
        maxPosts: count,
        maxPostsPerQuery: count,
      })

  const leads = (Array.isArray(items) ? items : [])
    .map(toLead)
    .filter((l): l is RawLead => l !== null)
  logger.info(
    {
      leads: leads.length,
      withPhone: leads.filter(l => l.phone).length,
      mode: urls.length ? 'groups' : 'search',
    },
    'Facebook scrape complete',
  )
  return leads
}
