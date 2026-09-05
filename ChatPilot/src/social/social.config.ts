function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

const appSecret = str('META_APP_SECRET', '');
const verifyToken = str('META_VERIFY_TOKEN', '');

export const socialConfig = {
  appId: str('META_APP_ID', ''),
  appSecret,
  verifyToken,
  graphVersion: str('META_GRAPH_VERSION', 'v26.0'),
  oauthRedirectUri: str('META_OAUTH_REDIRECT_URI', ''),
  loginConfigId: str('META_LOGIN_CONFIG_ID', ''),
  replyEnabled: bool('META_REPLY_ENABLED', true),
  privateReplyEnabled: bool('META_PRIVATE_REPLY_ENABLED', false),
  maxRepliesPerHourPerAccount: num('META_MAX_REPLIES_PER_HOUR', 30),
  intentModel: str('META_INTENT_MODEL', 'gemini-3.6-flash'),
  intentThreshold: num('META_INTENT_THRESHOLD', 0.6),
  dedupeWindowMin: num('META_DEDUPE_WINDOW_MIN', 60),
  waPrefillTemplate: str(
    'SOCIAL_WA_PREFILL_TEMPLATE',
    "Hi {company}, I saw your property post on {platform} and I'm interested. [{ref}]",
  ),
  isConfigured: !!appSecret && !!verifyToken,
};

export const graphBaseUrl = `https://graph.facebook.com/${socialConfig.graphVersion}`;
