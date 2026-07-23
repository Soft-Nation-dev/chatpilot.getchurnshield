import { scraperConfig as config } from './scraper-config';
import { log } from './logger';
import { runActor } from './apify-client';
import { extractPhone, extractEmail } from './extract';
import { parseState } from './location';
import type { RawLead } from './types';

const logger = log('scraper:twitter');

interface TweetItem {
  id?: string;
  id_str?: string;
  text?: string;
  fullText?: string;
  url?: string;
  author?: { userName?: string; name?: string; location?: string };
}

function toLead(tweet: TweetItem): RawLead | null {
  const sourceId = tweet.id || tweet.id_str || tweet.url;
  if (!sourceId) return null;
  const text = tweet.fullText || tweet.text || '';
  const userName = tweet.author?.userName ? `@${tweet.author.userName}` : null;

  return {
    source: 'twitter',
    sourceId: `twitter-${sourceId}`,
    name: tweet.author?.name || null,
    phone: extractPhone(text),
    email: extractEmail(text),
    website: null,
    address: null,
    handle: userName,
    rawText: text.slice(0, 1200) || null,
    category: 'Buyer',
    locationPref: parseState(text) || tweet.author?.location || config.apify.location,
  };
}

export async function scrapeTwitter(count: number): Promise<RawLead[]> {
  const items = await runActor<TweetItem>(config.apify.twitterActor, {
    searchTerms: config.apify.searchQueries,
    maxItems: count,
    sort: 'Latest',
  });

  const leads = (Array.isArray(items) ? items : []).map(toLead).filter((l): l is RawLead => l !== null);
  logger.info({ leads: leads.length, withPhone: leads.filter((l) => l.phone).length }, 'Twitter scrape complete');
  return leads;
}
