import { scraperConfig as config } from './scraper-config';
import { log } from './logger';
import { runActor } from './apify-client';
import { extractPhone, extractEmail, pickWebsite, mentionsNigeria } from './extract';
import { parseState } from './location';
import type { RawLead } from './types';

const logger = log('scraper:instagram');

interface IgItem {
  id?: string;
  username?: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  externalUrls?: { url?: string; link_type?: string }[];
  businessCategoryName?: string;
  businessAddress?: { city_name?: string; street_address?: string | null } | null;
  latestPosts?: { caption?: string }[];
  error?: string;
}

function toLead(item: IgItem): RawLead | null {
  if (!item || item.error) return null;
  const sourceId = item.id || item.username;
  if (!sourceId) return null;

  const bio = item.biography || '';
  const urls = [item.externalUrl, ...(item.externalUrls || []).map((u) => u?.url)].filter(
    (u): u is string => Boolean(u),
  );
  const posts = (item.latestPosts || [])
    .map((p) => (p && typeof p.caption === 'string' ? p.caption : ''))
    .filter(Boolean)
    .join('\n');

  const phone = extractPhone(...urls, bio, posts);
  const city = item.businessAddress?.city_name || null;

  if (!phone && !mentionsNigeria(city, bio, ...urls)) return null;

  let category = item.businessCategoryName || null;
  if (category) category = category.replace(/^None,?/i, '').trim() || null;

  return {
    source: 'instagram',
    sourceId: `instagram-${sourceId}`,
    name: item.fullName || item.username || null,
    phone,
    email: extractEmail(bio, posts),
    website: pickWebsite(item.externalUrls, item.externalUrl),
    address: item.businessAddress
      ? [item.businessAddress.street_address, city].filter(Boolean).join(', ') || null
      : null,
    handle: item.username ? `@${item.username}` : null,
    rawText: [bio, posts].filter(Boolean).join('\n').slice(0, 1000) || null,
    category,
    locationPref: parseState(`${bio} ${posts} ${city ?? ''}`) || city || config.apify.location,
  };
}

export async function scrapeInstagram(count: number): Promise<RawLead[]> {
  const items = await runActor<IgItem>(config.apify.instagramActor, {
    search: `${config.apify.location} real estate`,
    searchType: 'user',
    searchLimit: count,
    resultsType: 'details',
    resultsLimit: 1,
    addParentData: false,
  });

  const leads = (Array.isArray(items) ? items : []).map(toLead).filter((l): l is RawLead => l !== null);
  logger.info({ leads: leads.length, withPhone: leads.filter((l) => l.phone).length }, 'Instagram scrape complete');
  return leads;
}
