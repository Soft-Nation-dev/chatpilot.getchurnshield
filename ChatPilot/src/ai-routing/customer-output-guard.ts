const INTERNAL_ACTIONS = [
  'save_name',
  'save_budget',
  'save_property_preference',
  'save_timeline',
  'save_qualification_notes',
  'set_lead_stage',
  'set_needs_review',
  'change_bot_status',
  'activate_replies',
  'notify_company',
  'get_available_slots',
  'book_appointment',
  'cancel_appointment',
]

const ACTION_LINE = new RegExp(
  `^\\s*(?:[-*]\\s*)?(?:${INTERNAL_ACTIONS.join('|')})\\s*(?::|\\(|\\{)`,
  'i',
)

const INTERNAL_MARKER = new RegExp(
  `\\b(?:${INTERNAL_ACTIONS.join('|')}|tool_calls?|function_call|arguments)\\b\\s*(?::|\\(|\\{)`,
  'i',
)

const CUSTOMER_KEYS = [
  'customer_reply',
  'reply',
  'response',
  'message',
  'text',
  'answer',
]

function customerTextFromJson(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const record = value as Record<string, unknown>
  for (const key of CUSTOMER_KEYS) {
    if (typeof record[key] === 'string') return record[key].trim()
  }
  return ''
}

function stripInternalBlocks(input: string): string {
  const lines = input.split(/\r?\n/)
  const kept: string[] = []
  let skipping = false
  let braceDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (ACTION_LINE.test(trimmed)) {
      skipping = true
      braceDepth = 0
      continue
    }

    if (skipping) {
      if (/^(?:```)?(?:json)?\s*$/i.test(trimmed)) continue
      const startedJson = /^[\[{]/.test(trimmed)
      braceDepth += (line.match(/\{/g) || []).length
      braceDepth -= (line.match(/\}/g) || []).length
      if (
        braceDepth <= 0 &&
        trimmed &&
        !startedJson &&
        !/^[\s{}[\]",:0-9.-]+$/.test(trimmed) &&
        !/^"[^"\n]+"\s*:/.test(trimmed)
      ) {
        skipping = false
      } else {
        continue
      }
    }

    if (/^\s*(?:thought|reasoning|analysis)\s*:/i.test(trimmed)) continue
    kept.push(line)
  }

  return kept.join('\n')
}

/**
 * Final safety boundary for text that can be delivered to a customer.
 * It deliberately removes tool syntax and hidden reasoning even when a model
 * returns them as ordinary text instead of a real SDK tool call.
 */
export function sanitizeCustomerOutput(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  let output = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()

  try {
    const parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/gi, ''))
    output = customerTextFromJson(parsed)
  } catch {
    output = stripInternalBlocks(output)
  }

  output = output
    .replace(/```(?:json)?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!output || INTERNAL_MARKER.test(output)) return ''
  if (/^\s*[\[{][\s\S]*[\]}]\s*$/.test(output)) return ''
  return output
}
