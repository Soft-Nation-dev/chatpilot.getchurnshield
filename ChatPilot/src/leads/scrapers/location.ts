const AREA_TO_STATE: Record<string, string[]> = {
  Lagos: [
    'ibeju lekki',
    'ibeju-lekki',
    'lekki',
    'ikoyi',
    'ikeja',
    'ajah',
    'victoria island',
    'sangotedo',
    'awoyaya',
    'lakowe',
    'abraham adesanya',
    'ogombo',
    'badagry',
    'surulere',
    'magodo',
    'gbagada',
    'ikorodu',
    'festac',
    'oshodi',
    'maryland',
    'epe',
    'lagos',
  ],
  Enugu: [
    'independence layout',
    'new haven',
    'thinkers corner',
    'trans ekulu',
    'achara layout',
    'enugu',
  ],
  Abuja: [
    'maitama',
    'gwarinpa',
    'asokoro',
    'wuse',
    'jahi',
    'lugbe',
    'kubwa',
    'guzape',
    'lokogoma',
    'katampe',
    'lifecamp',
    'life camp',
    'gwagwalada',
    'garki',
    'apo',
    'abuja',
  ],
  Rivers: ['port harcourt', 'trans amadi', 'rumuokoro', 'eliozu', 'rivers'],
  Ogun: ['abeokuta', 'sagamu', 'agbara', 'arepo', 'mowe', 'ibafo'],
  Oyo: ['ibadan', 'bodija', 'jericho'],
  Anambra: ['awka', 'onitsha', 'nnewi', 'anambra'],
  Delta: ['asaba', 'warri'],
  Edo: ['benin city'],
  Kano: ['kano'],
}

export function parseState(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.toLowerCase()
  for (const [state, areas] of Object.entries(AREA_TO_STATE)) {
    for (const area of areas) {
      if (t.includes(area)) return state
    }
  }
  return null
}
