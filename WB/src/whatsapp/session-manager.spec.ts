import { isDirectWhatsAppChat } from './session-manager';

describe('isDirectWhatsAppChat', () => {
  it.each([
    '2348012345678@s.whatsapp.net',
    '123456789@lid',
  ])('accepts direct chats: %s', (jid) => {
    expect(isDirectWhatsAppChat(jid)).toBe(true);
  });

  it.each([
    '120363407444858383@g.us',
    'status@broadcast',
    'newsletter@newsletter',
    null,
    undefined,
  ])('rejects non-direct chats: %s', (jid) => {
    expect(isDirectWhatsAppChat(jid)).toBe(false);
  });
});
