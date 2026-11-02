import { ChatLifecycleService } from './chat-lifecycle.service'

describe('ChatLifecycleService', () => {
  const service = new ChatLifecycleService({} as any)
  const base = {
    id: 1,
    company_id: 1,
    chat_state: 'QUALIFYING',
    is_bot_activated: true,
    is_replies_activated: true,
    review_mode: 'ACTIVE',
    crm_appointment_id: null,
    companies: { is_bot_activated: true },
  }

  it('blocks every automated action during a human takeover', () => {
    const contact = {
      ...base,
      chat_state: 'HUMAN_TAKEOVER',
      review_mode: 'SOFT_REVIEW',
    }
    expect(service.evaluate(contact, 'INBOUND_REPLY').allowed).toBe(false)
    expect(service.evaluate(contact, 'FOLLOW_UP').allowed).toBe(false)
  })

  it('keeps hard takeover authoritative even when reply flags are on', () => {
    const contact = { ...base, review_mode: 'HARD_TAKEOVER' }
    expect(service.evaluate(contact, 'INBOUND_REPLY')).toMatchObject({
      allowed: false,
      reason: 'hard_takeover',
    })
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
      service.evaluate(
        { ...base, is_replies_activated: false },
        'INBOUND_REPLY',
      ).reason,
    ).toBe('automation_paused')
    expect(
      service.evaluate(
        { ...base, companies: { is_bot_activated: false } },
        'INBOUND_REPLY',
      ).allowed,
    ).toBe(false)
  })

  it('clears a terminal calendar handoff when an operator resumes automation', async () => {
    const tx = {
      contacts: {
        findUnique: jest.fn().mockResolvedValue({
          ...base,
          chat_state: 'HUMAN_TAKEOVER',
          is_replies_activated: false,
          conversation_state: {
            version: 1,
            inspection: {
              status: 'awaiting_human',
              propertyTitle: 'Demo Duplex',
            },
          },
        }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      chat_state_transitions: { create: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    } as any
    const lifecycle = new ChatLifecycleService(prisma)

    await lifecycle.resumeAutomation(1, {
      reason: 'Dashboard action: reopen',
      actor: 'dashboard_user',
    })

    expect(tx.contacts.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        is_bot_activated: true,
        is_replies_activated: true,
        needs_review: false,
        review_mode: 'ACTIVE',
        chat_state: 'QUALIFYING',
        conversation_state: { version: 1 },
      }),
    })
    expect(tx.chat_state_transitions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_state: 'HUMAN_TAKEOVER',
        to_state: 'QUALIFYING',
      }),
    })
  })
})
