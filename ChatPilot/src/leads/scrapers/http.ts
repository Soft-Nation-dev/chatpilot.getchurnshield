import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { scraperConfig as config } from './scraper-config'
import { runActor, apifyConfigured } from './apify-client'
import { log } from './logger'

const logger = log('http')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const PAGE_FUNCTION = `async function pageFunction(context) {
  const { page, request } = context;
  return { url: request.url, html: await page.content() };
}`

export async function fetchHtml(url: string): Promise<string> {
  if (apifyConfigured()) {
    try {
      return await fetchViaApifyBrowser(url)
    } catch (err) {
      logger.warn(
        { url, error: err instanceof Error ? err.message : String(err) },
        'Apify render failed — falling back to proxy/direct',
      )
    }
  }
  return fetchDirect(url)
}

function browserInput(url: string): Record<string, unknown> {
  const proxyConfiguration = {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: 'NG',
  }
  if (config.apify.browserActor.includes('content-crawler')) {
    return {
      startUrls: [{ url }],
      crawlerType: 'playwright:firefox',
      maxCrawlPages: 1,
      maxCrawlDepth: 0,
      saveHtml: true,
      htmlTransformer: 'none',
      proxyConfiguration,
    }
  }
  return {
    startUrls: [{ url }],
    pageFunction: PAGE_FUNCTION,
    proxyConfiguration,
    maxRequestRetries: 2,
    maxPagesPerCrawl: 1,
    pageLoadTimeoutSecs: 60,
  }
}

async function fetchViaApifyBrowser(url: string): Promise<string> {
  const items = await runActor<{ url?: string; html?: string }>(
    config.apify.browserActor,
    browserInput(url),
    {
      waitSecs: 240,
    },
  )
  const html = items.find(i => i.html)?.html
  if (!html) throw new Error('Apify render returned no html')
  return html
}

async function fetchDirect(url: string): Promise<string> {
  const options: Parameters<typeof axios.get>[1] = {
    timeout: 45_000,
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  }
  if (config.apify.proxyPassword) {
    const proxyUrl = `http://groups-RESIDENTIAL,country-NG:${config.apify.proxyPassword}@proxy.apify.com:8000`
    options.httpsAgent = new HttpsProxyAgent(proxyUrl)
    options.proxy = false
  }
  const res = await axios.get(url, options)
  return typeof res.data === 'string' ? res.data : String(res.data)
}
