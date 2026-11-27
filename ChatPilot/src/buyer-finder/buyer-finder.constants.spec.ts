import {
  buyerFinderGloballyEnabled,
  buyerFinderPublicDiscoveryEnabled,
} from './buyer-finder.constants'

describe('buyerFinderGloballyEnabled', () => {
  const originalBuyerFinder = process.env.BUYER_FINDER_ENABLED
  const originalScraping = process.env.SCRAPING_ENABLED
  const originalApify = process.env.APIFY_TOKEN

  afterEach(() => {
    process.env.BUYER_FINDER_ENABLED = originalBuyerFinder
    process.env.SCRAPING_ENABLED = originalScraping
    process.env.APIFY_TOKEN = originalApify
  })

  it('allows connected social scanning without enabling paid scraping', () => {
    process.env.BUYER_FINDER_ENABLED = 'true'
    process.env.SCRAPING_ENABLED = 'false'
    expect(buyerFinderGloballyEnabled()).toBe(true)
  })

  it('requires every public discovery safety control', () => {
    process.env.BUYER_FINDER_ENABLED = 'true'
    process.env.SCRAPING_ENABLED = 'true'
    process.env.APIFY_TOKEN = ''
    expect(buyerFinderPublicDiscoveryEnabled()).toBe(false)

    process.env.APIFY_TOKEN = 'test-token'
    expect(buyerFinderPublicDiscoveryEnabled()).toBe(true)
  })
})
