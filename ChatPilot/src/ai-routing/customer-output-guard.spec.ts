import { sanitizeCustomerOutput } from './customer-output-guard'

describe('sanitizeCustomerOutput', () => {
  it('keeps the useful copy and removes printed tool calls', () => {
    const raw = `Got it — a self-contained flat near 9th Mile.
save_property_preference:
json
{
  "property_type": "flat",
  "location": "9th mile"
}
set_lead_stage:
json
{"stage":"qualified"}
When would you like to move in?`

    expect(sanitizeCustomerOutput(raw)).toBe(
      'Got it — a self-contained flat near 9th Mile.\nWhen would you like to move in?',
    )
  })

  it('extracts an explicitly named customer reply from JSON', () => {
    expect(
      sanitizeCustomerOutput('{"reasoning":"private","reply":"Hello there"}'),
    ).toBe('Hello there')
  })

  it('rejects internal-only JSON and hidden reasoning', () => {
    expect(sanitizeCustomerOutput('{"stage":"qualified"}')).toBe('')
    expect(sanitizeCustomerOutput('<think>secret</think>')).toBe('')
  })
})
