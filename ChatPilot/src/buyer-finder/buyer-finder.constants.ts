export const BUYER_FINDER_QUEUE = 'buyer-finder'

export enum BuyerFinderJobKind {
  DISCOVER = 'discover-accounts',
  SCAN = 'scan-posts-and-comments',
  QUALIFY = 'qualify-comment',
}

export const BUYER_FINDER_ALLOWED_STATES = [
  'Abia',
  'Abuja',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const

export const buyerFinderGloballyEnabled = () =>
  ['1', 'true'].includes(
    String(process.env.BUYER_FINDER_ENABLED || 'false').toLowerCase(),
  ) &&
  ['1', 'true'].includes(
    String(process.env.SCRAPING_ENABLED || 'false').toLowerCase(),
  )
