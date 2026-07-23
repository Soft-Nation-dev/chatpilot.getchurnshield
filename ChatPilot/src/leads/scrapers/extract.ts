const WA_ME = /wa\.me\/(?:send\?phone=)?(\+?\d{7,15})/i;
const PHONE_TEXT = /(?:\+?234|0)[\s.\-()]?[789]\d(?:[\s.\-()]?\d){8}(?!\d)/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const NG_HINT =
  /nigeria|naija|\.ng\b|lekki|ikoyi|ajah|victoria island|\bikeja\b|abuja|port harcourt|ibadan|abeokuta|enugu|owerri|gwarinpa|maitama|\bwuse\b/i;

export function normalizeNgPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = `234${d.slice(1)}`;
  if (d.startsWith('2340')) d = `234${d.slice(4)}`;
  if (d.length === 10 && /^[789]/.test(d)) d = `234${d}`;
  return /^234[789]\d{9}$/.test(d) ? `+${d}` : null;
}

export function extractPhone(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const wa = t.match(WA_ME);
    if (wa) {
      const n = normalizeNgPhone(wa[1]);
      if (n) return n;
    }
  }
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(PHONE_TEXT);
    if (m) {
      const n = normalizeNgPhone(m[0]);
      if (n) return n;
    }
  }
  return null;
}

export function extractEmail(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(EMAIL);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

export function mentionsNigeria(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => t && NG_HINT.test(t));
}

export function pickWebsite(
  externalUrls: { url?: string; link_type?: string }[] | undefined,
  externalUrl: string | null | undefined,
): string | null {
  const bad = /wa\.me|instagram\.com|facebook\.com|l\.instagram\.com|linktr\.ee|taplink/i;
  const candidates: string[] = [];
  for (const e of externalUrls || []) if (e?.url) candidates.push(e.url);
  if (externalUrl) candidates.push(externalUrl);
  const good = candidates.find((u) => !bad.test(u));
  return good ? normalizeUrl(good) : null;
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
