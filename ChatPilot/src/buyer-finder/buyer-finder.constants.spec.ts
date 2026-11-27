import { buyerFinderGloballyEnabled } from './buyer-finder.constants'

describe('buyerFinderGloballyEnabled', () => {
  const originalBuyerFinder = process.env.BUYER_FINDER_ENABLED
  const originalScraping = process.env.SCRAPING_ENABLED

  afterEach(() => {
    process.env.BUYER_FINDER_ENABLED = originalBuyerFinder
    process.env.SCRAPING_ENABLED = originalScraping
  })

  it('requires both safety switches', () => {
    process.env.BUYER_FINDER_ENABLED = 'true'
    process.env.SCRAPING_ENABLED = 'false'
    expect(buyerFinderGloballyEnabled()).toBe(false)

    process.env.SCRAPING_ENABLED = 'true'
    expect(buyerFinderGloballyEnabled()).toBe(true)
  })
})
