function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function csv(key: string, fallback: string[]): string[] {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export const scraperConfig = {
  scrapingEnabled: bool('SCRAPING_ENABLED', false),
  apify: {
    token: str('APIFY_TOKEN', ''),
    proxyPassword: str('APIFY_PROXY_PASSWORD', ''),
    fbSearchActor: str('APIFY_FB_SEARCH_ACTOR', 'apify/facebook-search-scraper'),
    fbPagesActor: str('APIFY_FB_PAGES_ACTOR', 'apify/facebook-pages-scraper'),
    twitterActor: str('APIFY_TWITTER_ACTOR', 'apidojo/tweet-scraper'),
    instagramActor: str('APIFY_INSTAGRAM_ACTOR', 'apify/instagram-scraper'),
    tiktokActor: str('APIFY_TIKTOK_ACTOR', 'clockworks/tiktok-scraper'),
    postsActor: str('APIFY_FB_POSTS_ACTOR', 'apify/facebook-posts-scraper'),
    browserActor: str('APIFY_BROWSER_ACTOR', 'apify/website-content-crawler'),
    fbGroupUrls: csv('FB_GROUP_URLS', []),
    searchQueries: csv('SEARCH_QUERIES', [
      'looking for land to buy in Lekki',
      'need land for sale in Lagos',
      'buy property Nigeria budget',
    ]),
    location: str('SEARCH_LOCATION', 'Nigeria'),
    maxResults: num('MAX_RESULTS', 25),
    enabledSources: csv('ENABLED_SOURCES', ['npc', 'nairaland', 'facebook', 'twitter', 'instagram', 'tiktok']),
    useMock: bool('USE_MOCK_SCRAPE', false),
  },
  sources: {
    npcUrl: str('NPC_URL', 'https://nigeriapropertycentre.com/property-requests'),
    nairalandUrl: str('NAIRALAND_URL', 'https://www.nairaland.com/properties'),
  },
  leadFilters: {
    businessExclusion: [
      'properties',
      'property',
      'realtors',
      'realty',
      'real estate',
      'estate',
      'partners',
      'consults',
      'consult',
      'homes',
      'limited',
      'ltd',
      'developers',
      'developer',
      'ventures',
      'investment',
      'investments',
      'agency',
      'agencies',
      'enterprise',
      'global homes',
      'nig ltd',
    ],
    buyerIntentPhrases: [
      'title on the land',
      'c of o',
      'c-of-o',
      'governor consent',
      'consent',
      'free from acquisition',
      'verify the survey',
      'survey plan',
      'gazetted',
      'allocation papers',
      'verified family land',
      'family land',
      'looking for land',
      'looking to buy',
      'want to buy land',
      'buy land',
      'need land',
      'land under',
      'distressed sale',
      'plot of dry land',
      'dry land',
      'waterlogged',
      'genuine developer',
      'flexible payment',
      'buy and build',
      'pricing brochure',
      'brochure and layout',
      'physical inspection',
      'book inspection',
      'book physical inspection',
      'direct owner',
      'mandate',
      'pm your number',
      'still available',
      'video of the site',
      'inspect this saturday',
      'want to inspect',
      'send me video',
    ],
  },
  monthlyLeadQuota: num('MONTHLY_LEAD_QUOTA', 300),
  dailyLeadLimit: num('DAILY_LEAD_LIMIT', 50),
  poolTopUpMaxCycles: num('POOL_TOPUP_MAX_CYCLES', 2),
  adminSecret: str('ADMIN_SECRET', ''),
};
