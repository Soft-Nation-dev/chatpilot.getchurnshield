import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { runScrapers } from '../scrapers';
import { scraperConfig } from '../scrapers/scraper-config';
import { normalizeNgPhone } from '../scrapers/extract';
import { parseState } from '../scrapers/location';
import type { RawLead } from '../scrapers/types';

@Injectable()
export class LeadSourcingService {
  private readonly logger = new Logger(LeadSourcingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private isBuyer(raw: RawLead): boolean {
    if (!raw.phone) return false;
    const nameHandle = `${raw.name ?? ''} ${raw.handle ?? ''}`.toLowerCase();
    if (scraperConfig.leadFilters.businessExclusion.some((k) => nameHandle.includes(k))) return false;
    const text = (raw.rawText ?? '').trim().toLowerCase();
    if (!text) return false;
    return scraperConfig.leadFilters.buyerIntentPhrases.some((p) => text.includes(p));
  }

  async poolSize(): Promise<number> {
    return this.prisma.pool.count();
  }

  async topUpPool(deficit: number): Promise<number> {
    if (deficit <= 0) return 0;
    if (!scraperConfig.scrapingEnabled) {
      this.logger.log('Scraping is disabled; skipping pool top-up');
      return 0;
    }
    let inserted = 0;
    try {
      this.logger.log(`Topping up pool with up to ${deficit} buyers`);
      const results = await runScrapers(scraperConfig.apify.enabledSources, Math.max(scraperConfig.apify.maxResults, deficit));
      for (const { leads } of results) {
        for (const raw of leads) {
          if (inserted >= deficit) return inserted;
          if (!this.isBuyer(raw)) continue;
          const normalized = normalizeNgPhone(raw.phone);
          if (!normalized) continue;
          const phone = BigInt(normalized.replace(/\D/g, ''));
          try {
            const existing = await this.prisma.pool.findUnique({
              where: { phone },
              select: { id: true },
            });
            if (existing) continue;
            await this.prisma.pool.create({
              data: {
                name: raw.name ?? null,
                phone,
                email: raw.email ?? null,
                website: raw.website ?? null,
                address: raw.address ?? null,
                source: raw.source,
                source_id: raw.sourceId,
                raw_text: raw.rawText ?? null,
                location_state: raw.locationPref || parseState(raw.rawText ?? ''),
                qual_score: 1,
              },
            });
            inserted += 1;
          } catch {
            continue;
          }
        }
      }
      this.logger.log(`Added ${inserted} new buyers to pool`);
    } catch (err) {
      this.logger.error(`Pool top-up failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return inserted;
  }
}
