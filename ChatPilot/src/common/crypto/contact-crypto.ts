import { decryptMessage, encryptMessage } from './message-crypto'

const ENCRYPTED_CONTACT_FIELDS = ['budget_raw', 'qualification_notes']

export function encryptContactFields<T extends Record<string, any>>(
  data: T,
): T {
  for (const field of ENCRYPTED_CONTACT_FIELDS) {
    const value = data[field]
    if (typeof value === 'string' && value !== '') {
      ;(data as Record<string, any>)[field] = encryptMessage(value)
    }
  }
  return data
}

export function decryptContactFields<T extends Record<string, any>>(
  row: T | null,
): T | null {
  if (!row) return row
  for (const field of ENCRYPTED_CONTACT_FIELDS) {
    const value = row[field]
    if (typeof value === 'string' && value !== '') {
      ;(row as Record<string, any>)[field] = decryptMessage(value)
    }
  }
  return row
}

export function decryptContactsInPlace<T extends Record<string, any>>(
  rows: T[],
): T[] {
  for (const row of rows) {
    decryptContactFields(row)
  }
  return rows
}
