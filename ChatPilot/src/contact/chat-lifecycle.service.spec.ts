import { ChatLifecycleService } from './chat-lifecycle.service'

describe('ChatLifecycleService', () => {
  const service = new ChatLifecycleService({} as any)
  const base = {
    id: 1,
    company_id: 1,
    chat_state: 'QUALIFYING',
    is_bot_activated: true,
    is_replies_activated: true,
    crm_appointment_id: null,
    companies: { is_bot_activated: true },
  }

  it('blocks every automated action during a human takeover', () => {
    const contact = { ...base, chat_state: 'HUMAN_TAKEOVER' }
    expect(service.evaluate(contact, 'INBOUND_REPLY').allowed).toBe(false)
    expect(service.evaluate(contact, 'FOLLOW_UP').allowed).toBe(false)
  })

  it('allows an inbound reply but blocks proactive follow-up after booking', () => {
    const contact = {
      ...base,
      chat_state: 'INSPECTION_BOOKED',
      crm_appointment_id: 'booking-1',
    }
    expect(service.evaluate(contact, 'INBOUND_REPLY').allowed).toBe(true)
    expect(service.evaluate(contact, 'FOLLOW_UP').allowed).toBe(false)
  })

  it('keeps a cold lead silent until they message again', () => {
    const contact = { ...base, chat_state: 'COLD_LEAD' }
    expect(service.evaluate(contact, 'FOLLOW_UP').allowed).toBe(false)
    expect(service.evaluate(contact, 'INBOUND_REPLY').allowed).toBe(true)
  })

  it('respects contact and company pause switches', () => {
    expect(
      service.evaluate({ ...base, is_replies_activated: false }, 'INBOUND_REPLY')
        .reason,
    ).toBe('automation_paused')
    expect(
      service.evaluate(
        { ...base, companies: { is_bot_activated: false } },
        'INBOUND_REPLY',
      ).allowed,
    ).toBe(false)
  })
})
