/**
 * Canonical WhatsApp Gateway configuration for the Next.js layer.
 * Secrets and production URLs must come from environment variables.
 */
function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/^=+/, '').trim();
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

export const WA_CONFIG = {
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

  get configured(): boolean {
    return Boolean(this.baseUrl && this.secret);
  },

  get senderPhone(): string {
    return '6285904403535';
  },

  get testDestinationPhone(): string {
    return '6287862766846';
  },

  get csPhone(): string {
    return (process.env.WHATSAPP_CS_PHONE || this.testDestinationPhone).trim();
  },

  get timeoutMs(): number {
    const ms = parseInt(process.env.WAHA_TIMEOUT_MS || '', 10);
    return !isNaN(ms) && ms > 0 ? ms : 15000;
  },
};
