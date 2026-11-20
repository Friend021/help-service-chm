import type { ServerResponse } from 'node:http';
import type { FastifyReply } from 'fastify';
import type { Env } from './config.js';
import type { SseEventPayload } from './types.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Тонкая обёртка над raw-ответом: пишет SSE-блоки и умеет
 * «печатать» текст порциями, как это делает LLM.
 */
export class SseWriter {
  private closed = false;

  constructor(
    private readonly res: ServerResponse,
    private readonly delayMs: number,
    private readonly chunkWords: number,
  ) {
    this.res.on('close', () => {
      this.closed = true;
    });
  }

  get isClosed(): boolean {
    return this.closed || this.res.writableEnded || this.res.destroyed;
  }

  private write(chunk: string): Promise<void> {
    if (this.isClosed) return Promise.resolve();
    return new Promise((resolve) => {
      if (this.res.write(chunk)) {
        resolve();
        return;
      }
      this.res.once('drain', resolve);
    });
  }

  async send(payload: SseEventPayload): Promise<void> {
    await this.write(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  /** Стримит текст чанками по N слов. messageId стабилен для всех дельт. */
  async streamText(messageId: string, text: string): Promise<void> {
    const words = text.split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < words.length) {
      const size = this.chunkWords + (index % 2 === 0 ? 0 : 1);
      const delta = words.slice(index, index + size).join(' ');
      index += size;
      await this.send({ type: 'MESSAGE_DELTA', messageId, delta: `${delta}${index < words.length ? ' ' : ''}` });
      if (this.isClosed) return;
      await sleep(this.delayMs);
    }
  }

  close(): void {
    if (!this.isClosed) this.res.end();
    this.closed = true;
  }
}

/** Открывает SSE-поток и отдаёт writer. Вызывать только внутри route handler. */
export function openSse(reply: FastifyReply, env: Env): SseWriter {
  reply.hijack();
  const res = reply.raw;

  // reply.hijack() пропускает onSend-хуки @fastify/cors, поэтому заголовки
  // CORS для SSE выставляем вручную — иначе браузер блокирует поток.
  const origin = reply.request.headers.origin;
  const allowOrigin =
    origin && env.corsOrigins.includes(origin) ? origin : undefined;

  res.writeHead(200, {
    ...SSE_HEADERS,
    ...(allowOrigin
      ? {
          'Access-Control-Allow-Origin': allowOrigin,
          'Access-Control-Allow-Credentials': 'true',
          Vary: 'Origin',
        }
      : {}),
  });
  res.write('retry: 3000\n\n');
  return new SseWriter(res, env.streamDelayMs, env.streamChunkWords);
}

export function initialDelay(env: Env): Promise<void> {
  return sleep(env.initialDelayMs);
}

/** Открывает поток, выполняет сценарий и гарантированно закрывает его. */
export async function runSse(
  reply: FastifyReply,
  env: Env,
  producer: (writer: SseWriter) => Promise<void>,
): Promise<void> {
  const writer = openSse(reply, env);
  try {
    await producer(writer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Внутренняя ошибка мока';
    await writer.send({ type: 'ERROR', message });
  } finally {
    writer.close();
  }
}
