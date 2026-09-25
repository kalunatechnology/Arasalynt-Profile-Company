import 'server-only';

import { createHmac, randomUUID } from 'crypto';

export type ProjectScope = {
  mode: 'ALL' | 'LIST';
  projectIds: string[];
};

export type RuntimeContextV2 = {
  contextVersion: 2;
  externalTenantId: string;
  externalUserId: string;
  companyId: string;
  roleCodes: string[];
  enabledModules: string[];
  permissions: string[];
  projectScope: ProjectScope;
  issuedAt: number;
  expiresAt: number;
  jti: string;
  locale: string;
};

export type EnterpriseChatbotConfig = {
  baseUrl: string;
  tenantApiKey: string;
  externalTenantId: string;
  inboundContextKey: string;
  companyId: string;
  enabledModules: string[];
  roleCodes: string[];
  permissions: string[];
  locale: string;
  timeoutMs: number;
  projectScope: ProjectScope;
};

function parseCsv(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Accept either the preferred base URL or the older Admin UI value that
 * contains /api/v1/chat/completions. All server integrations consume a base URL.
 */
export function normalizeChatbotBaseUrl(rawValue?: string): string {
  const raw = String(rawValue || 'https://chatbot-arsalynk.vercel.app').trim();
  return raw
    .replace(/\/+$/, '')
    .replace(/\/api\/v1\/chat\/completions$/i, '')
    .replace(/\/api\/v1$/i, '')
    .replace(/\/+$/, '');
}

export function getEnterpriseChatbotConfig(): EnterpriseChatbotConfig {
  const tenantApiKey = String(process.env.CHATBOT_TENANT_API_KEY || '').trim();
  const externalTenantId = String(process.env.CHATBOT_TENANT_EXTERNAL_ID || '').trim();
  const inboundContextKey = String(process.env.CHATBOT_INBOUND_CONTEXT_KEY || '').trim();

  const missing: string[] = [];
  if (!tenantApiKey) missing.push('CHATBOT_TENANT_API_KEY');
  if (!externalTenantId) missing.push('CHATBOT_TENANT_EXTERNAL_ID');
  if (!inboundContextKey) missing.push('CHATBOT_INBOUND_CONTEXT_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing enterprise chatbot environment: ${missing.join(', ')}`);
  }

  const timeoutCandidate = Number(process.env.CHATBOT_TIMEOUT_MS || 70000);
  const timeoutMs = Number.isFinite(timeoutCandidate)
    ? Math.min(Math.max(Math.trunc(timeoutCandidate), 1000), 120000)
    : 70000;

  const projectScopeMode: 'ALL' | 'LIST' =
    String(process.env.CHATBOT_PROJECT_SCOPE_MODE || 'LIST').toUpperCase() === 'ALL'
      ? 'ALL'
      : 'LIST';

  return {
    baseUrl: normalizeChatbotBaseUrl(
      process.env.CHATBOT_API_BASE_URL || process.env.CHATBOT_API_URL,
    ),
    tenantApiKey,
    externalTenantId,
    inboundContextKey,
    companyId: String(process.env.CHATBOT_COMPANY_ID || externalTenantId).trim(),
    enabledModules: parseCsv(process.env.CHATBOT_ENABLED_MODULES, ['GENERAL']),
    roleCodes: parseCsv(process.env.CHATBOT_ROLE_CODES, ['CUSTOMER']),
    permissions: parseCsv(process.env.CHATBOT_PERMISSIONS, []),
    locale: String(process.env.CHATBOT_LOCALE || 'id-ID').trim() || 'id-ID',
    timeoutMs,
    projectScope: {
      mode: projectScopeMode,
      projectIds:
        projectScopeMode === 'ALL'
          ? []
          : parseCsv(process.env.CHATBOT_PROJECT_IDS, []),
    },
  };
}

/** Matches Chatbot_Arsalynk canonicalJson exactly. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const sortedKeys = Object.keys(objectValue).sort();
  return `{${sortedKeys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(objectValue[key])}`)
    .join(',')}}`;
}

export function buildSignedRuntimeContext(externalUserId: string): {
  context: RuntimeContextV2;
  signature: string;
  config: EnterpriseChatbotConfig;
} {
  const config = getEnterpriseChatbotConfig();
  const normalizedExternalUserId = String(externalUserId || '').trim();

  if (!normalizedExternalUserId) {
    throw new Error('externalUserId is required for enterprise chatbot context');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const context: RuntimeContextV2 = {
    contextVersion: 2,
    externalTenantId: config.externalTenantId,
    externalUserId: normalizedExternalUserId,
    companyId: config.companyId,
    roleCodes: config.roleCodes,
    enabledModules: config.enabledModules,
    permissions: config.permissions,
    projectScope: config.projectScope,
    issuedAt,
    // Chatbot contract permits a maximum five-minute window. Keep margin for skew.
    expiresAt: issuedAt + 240,
    jti: randomUUID(),
    locale: config.locale,
  };

  const signature = createHmac('sha256', config.inboundContextKey)
    .update(canonicalJson(context))
    .digest('hex');

  return { context, signature, config };
}
