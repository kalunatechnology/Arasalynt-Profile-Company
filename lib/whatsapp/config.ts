/**
 * Canonical WhatsApp configuration for the Next.js layer.
 *
 * Provider switch:
 * - BAYPASS=true  -> existing Hostinger/Baileys crm wa gateway
 * - BAYPASS=false -> Meta WhatsApp Cloud API (direct text only)
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

function isValidInternationalPhone(raw: string): boolean {
  const phone = normalizePhone(raw);
  return /^\d{8,15}$/.test(phone);
}

function isValidPhoneNumberId(raw: string): boolean {
  return /^\d{5,}$/.test(String(raw || '').trim());
}

function uniqueSecrets(values: Array<[string, string | undefined]>): Array<{ source: string; value: string }> {
  const seen = new Set<string>();
  const result: Array<{ source: string; value: string }> = [];

  for (const [source, raw] of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push({ source, value });
  }

  return result;
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

  /**
   * Accept the canonical Meta App Secret plus common aliases and one previous
   * secret for zero-downtime secret rotation. Values are deduplicated and
   * never exposed by status endpoints or logs.
   */
  get cloudAppSecrets(): Array<{ source: string; value: string }> {
    return uniqueSecrets([
      ['WHATSAPP_CLOUD_APP_SECRET', process.env.WHATSAPP_CLOUD_APP_SECRET],
      ['META_APP_SECRET', process.env.META_APP_SECRET],
      ['FACEBOOK_APP_SECRET', process.env.FACEBOOK_APP_SECRET],
      ['WHATSAPP_CLOUD_APP_SECRET_PREVIOUS', process.env.WHATSAPP_CLOUD_APP_SECRET_PREVIOUS],
    ]);
  },

  get cloudAppSecret(): string {
    return this.cloudAppSecrets[0]?.value || '';
  },

  get cloudAppSecretSources(): string[] {
    return this.cloudAppSecrets.map((item) => item.source);
  },

  get cloudCsPhone(): string {
    return normalizePhone(process.env.WHATSAPP_CLOUD_CS_PHONE || '');
  },

  get cloudMessagesUrl(): string {
    if (!this.cloudPhoneNumberId) return '';
    return `https://graph.facebook.com/${this.cloudApiVersion}/${this.cloudPhoneNumberId}/messages`;
  },

  get cloudPhoneInfoUrl(): string {
    if (!this.cloudPhoneNumberId) return '';
    return `https://graph.facebook.com/${this.cloudApiVersion}/${this.cloudPhoneNumberId}?fields=id,display_phone_number,verified_name`;
  },

  /**
   * Outbound Meta validation. This deliberately remains separate from webhook
   * validation because outbound can be healthy while inbound is misconfigured.
   */
  get cloudConfigError(): string {
    if (!this.cloudPhoneNumberId) {
      return 'WHATSAPP_CLOUD_PHONE_NUMBER_ID belum diisi.';
    }
    if (!isValidPhoneNumberId(this.cloudPhoneNumberId)) {
      return 'WHATSAPP_CLOUD_PHONE_NUMBER_ID tidak valid; isi dengan Phone Number ID numerik dari Meta, bukan nomor telepon.';
    }
    if (!this.cloudAccessToken) {
      return 'WHATSAPP_CLOUD_ACCESS_TOKEN belum diisi dengan Permanent Access Token Meta.';
    }
    if (!process.env.WHATSAPP_CLOUD_CS_PHONE?.trim()) {
      return 'WHATSAPP_CLOUD_CS_PHONE belum diisi dengan nomor tujuan CS.';
    }
    if (!isValidInternationalPhone(this.cloudCsPhone)) {
      return 'WHATSAPP_CLOUD_CS_PHONE tidak valid; gunakan nomor internasional hanya angka, contoh 628xxxxxxxxxx.';
    }
    return '';
  },

  /**
   * Inbound webhook validation. Meta signs POST payloads using the Meta App
   * Secret (NOT WAHA_API_KEY, GATEWAY_WEBHOOK_SECRET, verify token, or access
   * token). Fail closed when the required inbound settings are missing.
   */
  get cloudWebhookConfigError(): string {
    if (!this.cloudVerifyToken) {
      return 'WHATSAPP_CLOUD_VERIFY_TOKEN belum diisi.';
    }
    if (this.cloudAppSecrets.length === 0) {
      return 'Meta App Secret belum diisi. Gunakan WHATSAPP_CLOUD_APP_SECRET (disarankan), META_APP_SECRET, atau FACEBOOK_APP_SECRET.';
    }
    if (!this.cloudPhoneNumberId || !isValidPhoneNumberId(this.cloudPhoneNumberId)) {
      return 'WHATSAPP_CLOUD_PHONE_NUMBER_ID belum valid untuk webhook inbound.';
    }
    return '';
  },

  get cloudWebhookConfigured(): boolean {
    return this.cloudWebhookConfigError === '';
  },

  /**
   * Meta mode is intentionally fail-closed. It must never silently fall back to
   * the legacy/test destination because BAYPASS=false means "Meta only".
   */
  get cloudConfigured(): boolean {
    return this.cloudConfigError === '';
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
   * BAYPASS=false: destination MUST come from WHATSAPP_CLOUD_CS_PHONE.
   * BAYPASS=true : keep the legacy WHATSAPP_CS_PHONE/test fallback behavior.
   */
  get csPhone(): string {
    if (!this.baypass) {
      return this.cloudCsPhone;
    }
    return normalizePhone(
      process.env.WHATSAPP_CS_PHONE || this.testDestinationPhone
    );
  },

  get timeoutMs(): number {
    const ms = parseInt(process.env.WAHA_TIMEOUT_MS || '', 10);
    return !isNaN(ms) && ms > 0 ? ms : 15000;
  },
};
