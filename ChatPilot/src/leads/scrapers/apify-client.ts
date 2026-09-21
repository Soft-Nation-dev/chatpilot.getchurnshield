import { ApifyClient } from 'apify-client'
import { scraperConfig as config } from './scraper-config'
import { log } from './logger'

const logger = log('apify')

let client: ApifyClient | null = null

function getClient(): ApifyClient {
  if (!config.apify.token) {
    throw new Error('APIFY_TOKEN is not set')
  }
  if (!client) {
    client = new ApifyClient({ token: config.apify.token })
  }
  return client
}

export function apifyConfigured(): boolean {
  return Boolean(config.apify.token)
}

export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  options?: { waitSecs?: number; timeout?: number; memory?: number },
): Promise<T[]> {
  logger.info({ actorId }, 'Starting Apify actor run')
  const run = await getClient().actor(actorId).call(input, options)
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems()
  logger.info(
    { actorId, items: items.length, runId: run.id },
    'Apify actor run finished',
  )
  return items as T[]
}
