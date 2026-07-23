import * as cheerio from 'cheerio';
import { scraperConfig as config } from './scraper-config';
import { log } from './logger';
import { fetchHtml } from './http';
import { extractPhone, extractEmail } from './extract';
import { parseState } from './location';
import type { RawLead } from './types';

const logger = log('scraper:npc');

export async function scrapeNpc(count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  try {
    const html = await fetchHtml(config.sources.npcUrl);
    const $ = cheerio.load(html);

    const items: { url: string; title: string }[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).text().replace(/\s+/g, ' ').trim();
      if (
        /property-request|wanted|looking-for|want-to-(buy|rent)/i.test(href) &&
        !/create|login|register|advertise/i.test(href) &&
        title.length > 15
      ) {
        items.push({ url: href.startsWith('http') ? href : `https://nigeriapropertycentre.com${href}`, title });
      }
    });

    const seen = new Set<string>();
    for (const it of items) {
      if (leads.length >= count) break;
      if (seen.has(it.url)) continue;
      seen.add(it.url);

      let detail = '';
      let name: string | null = null;
      try {
        const d = await fetchHtml(it.url);
        const $$ = cheerio.load(d);
        detail = $$('.description, .property-details, #details, .wp-block-body')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .trim();
        name = $$('.name, .author, [itemprop="name"], .agent-name').first().text().trim() || null;
      } catch {
        detail = '';
      }

      const corpus = `${it.title} ${detail}`;
      leads.push({
        source: 'npc',
        sourceId: `npc-${it.url}`,
        name,
        phone: extractPhone(detail),
        email: extractEmail(detail),
        website: null,
        address: null,
        handle: it.url,
        rawText: it.title.slice(0, 1200),
        category: 'Buyer',
        locationPref: parseState(corpus) || config.apify.location,
      });
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'NPC fetch failed');
  }
  logger.info({ leads: leads.length, withPhone: leads.filter((l) => l.phone).length }, 'NPC scrape complete');
  return leads;
}
