import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

export interface SseBlock {
  event: string;
  data: Record<string, unknown>;
}

export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp({
    logger: false,
    env: {
      logLevel: 'silent',
      initialDelayMs: 0,
      streamDelayMs: 0,
      requireAuth: true,
      publicUrl: 'http://localhost:3000',
    },
  });
}

export function formBody(values: Record<string, string>): { payload: string; headers: Record<string, string> } {
  return {
    payload: new URLSearchParams(values).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
}

export async function getToken(
  app: FastifyInstance,
  username = 'demo',
  password = 'demo',
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/realms/compass/protocol/openid-connect/token',
    ...formBody({
      grant_type: 'password',
      client_id: 'compass-frontend',
      username,
      password,
    }),
  });

  if (response.statusCode !== 200) {
    throw new Error(`token request failed: ${response.statusCode} ${response.body}`);
  }

  const body = response.json<{ access_token: string; refresh_token: string }>();
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

export function authHeader(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

export function parseSse(body: string): SseBlock[] {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('event:'))
    .map((block) => {
      const lines = block.split('\n');
      const event = (lines.find((line) => line.startsWith('event:')) ?? 'event:').slice(6).trim();
      const rawData = (lines.find((line) => line.startsWith('data:')) ?? 'data:{}').slice(5).trim();
      return { event, data: JSON.parse(rawData) as Record<string, unknown> };
    });
}

export function eventTypes(blocks: SseBlock[]): string[] {
  return blocks.map((block) => block.event);
}

export function firstEvent<T = Record<string, unknown>>(blocks: SseBlock[], type: string): T | undefined {
  return blocks.find((block) => block.event === type)?.data as T | undefined;
}
