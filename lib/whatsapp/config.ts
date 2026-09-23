/**
 * Canonical WhatsApp configuration for the Next.js layer.
 *
 * Provider switch:
 * - BAYPASS=true  -> existing Hostinger/Baileys crm wa gateway
 * - BAYPASS=false -> Meta WhatsApp Cloud API
 *
 * NOTE: The environment variable is intentionally named BAYPASS to preserve
 * the deployment contract requested by the project.
 */
function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/^=+/, '').trim();
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

function normalizePhone(raw: string): string {
  const cleaned = String(raw || '').replace(/\D/g, '');
  return cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

export const WA_CONFIG = {
  /**
   * Keep legacy crm wa as the default so existing deployments do not change
   * behavior until BAYPASS is explicitly set to false.
   */
  get baypass(): boolean {
    return parseBoolean(process.env.BAYPASS, true);
  },

  get provider(): 'crm_wa' | 'meta_cloud' {
    return this.baypass ? 'crm_wa' : 'meta_cloud';
  },

  // ── Existing crm wa / Baileys gateway ───────────────────────────────
  get baseUrl(): string {
    return normalizeBaseUrl(
      process.env.WAHA_BASE_URL ||
      process.env.WHATSAPP_BACKEND_URL ||
      ''
    );
  },

  get secret(): string {
    return (process.env.GATEWAY_SECRET || process.env.WAHA_API_KEY || '').trim();
  },

  // ── Meta WhatsApp Cloud API ─────────────────────────────────────────
  get cloudApiVersion(): string {
    const raw = (process.env.WHATSAPP_CLOUD_API_VERSION || 'v25.0').trim();
    return raw.startsWith('v') ? raw : `v${raw}`;
  },

  get cloudPhoneNumberId(): string {
    return (process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '').trim();
  },

  get cloudAccessToken(): string {
    return (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || '').trim();
  },

  get cloudVerifyToken(): string {
    return (process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || '').trim();
  },

  get cloudAppSecret(): string {
    return (process.env.WHATSAPP_CLOUD_APP_SECRET || '').trim();
  },

  get cloudMessagesUrl(): string {
    if (!this.cloudPhoneNumberId) return '';
    return `https://graph.facebook.com/${this.cloudApiVersion}/${this.cloudPhoneNumberId}/messages`;
  },

  get cloudConfigured(): boolean {
    return Boolean(this.cloudPhoneNumberId && this.cloudAccessToken);
  },

  get gatewayConfigured(): boolean {
    return Boolean(this.baseUrl && this.secret);
  },

  get configured(): boolean {
    return this.baypass ? this.gatewayConfigured : this.cloudConfigured;
  },

  get senderPhone(): string {
    return '6285904403535';
  },

  get testDestinationPhone(): string {
    return '6287862766846';
  },

  /**
   * crm wa and Meta may target different CS numbers during migration.
   * WHATSAPP_CLOUD_CS_PHONE wins only when Meta is active.
   */
  get csPhone(): string {
    const raw = !this.baypass
      ? (process.env.WHATSAPP_CLOUD_CS_PHONE || process.env.WHATSAPP_CS_PHONE || this.testDestinationPhone)
      : (process.env.WHATSAPP_CS_PHONE || this.testDestinationPhone);
    return normalizePhone(raw);
  },

  get timeoutMs(): number {
    const ms = parseInt(process.env.WAHA_TIMEOUT_MS || '', 10);
    return !isNaN(ms) && ms > 0 ? ms : 15000;
  },
};
