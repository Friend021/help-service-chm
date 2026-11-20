import type { FastifyBaseLogger } from 'fastify';

export interface Env {
  port: number;
  host: string;
  logLevel: string;
  publicUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string | null;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  allowedRedirectOrigins: string[];
  corsOrigins: string[];
  legacyReturnUrl: string;
  initialDelayMs: number;
  streamDelayMs: number;
  streamChunkWords: number;
  requireAuth: boolean;
}

type RawEnv = Record<string, string | undefined>;

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !['false', '0', 'no', 'off'].includes(value.toLowerCase());
}

/** Единая точка чтения окружения. Overrides нужны тестам. */
export function loadEnv(source: RawEnv = process.env, overrides: Partial<Env> = {}): Env {
  const env: Env = {
    port: toInt(source.PORT, 3000),
    host: source.HOST ?? '0.0.0.0',
    logLevel: source.LOG_LEVEL ?? 'info',
    publicUrl: (source.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    realm: source.REALM ?? 'compass',
    clientId: source.CLIENT_ID ?? 'compass-frontend',
    clientSecret: source.CLIENT_SECRET?.trim() ? source.CLIENT_SECRET.trim() : null,
    accessTokenTtlSeconds: toInt(source.ACCESS_TOKEN_TTL_SECONDS, 300),
    refreshTokenTtlSeconds: toInt(source.REFRESH_TOKEN_TTL_SECONDS, 1800),
    allowedRedirectOrigins: toList(source.ALLOWED_REDIRECT_ORIGINS, ['http://localhost:4200']),
    corsOrigins: toList(source.CORS_ORIGINS, ['http://localhost:4200']),
    legacyReturnUrl:
      source.LEGACY_RETURN_URL ?? 'https://re-team.internal/assessment/development-plan?imported=true',
    initialDelayMs: toInt(source.INITIAL_DELAY_MS, 400),
    streamDelayMs: toInt(source.STREAM_DELAY_MS, 35),
    streamChunkWords: Math.max(1, toInt(source.STREAM_CHUNK_WORDS, 3)),
    requireAuth: toBool(source.REQUIRE_AUTH, true),
  };

  return { ...env, ...overrides };
}

export function silentLogger(): boolean {
  return false;
}

export type Logger = FastifyBaseLogger;
