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
   * Human-readable validation used by API routes/logging. Never includes secret
   * values, so it is safe to return to the website for diagnostics.
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
