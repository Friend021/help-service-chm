import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import {
  SseEventPayload,
  SseEventName,
  SseEvent,
  ErrorPayload,
} from '../../models/idp.models';
import { ApiError, toApiError } from './api-error';
import { AuthService } from '../auth/auth.service';

/** Error instance thrown by SseService (message preserved, ApiError attached). */
export class SseConnectError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'SseConnectError';
    this.apiError = apiError;
  }
}

/** Authentication surface used by the raw-fetch SSE layer. */
interface AuthTokenBridge {
  getFreshToken(): Promise<string>;
  /** Single-flight refresh owned by AuthService (keycloak + mock paths). */
  refreshToken(): Promise<boolean>;
}

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly baseUrl = environment.apiUrl.replace('/api/v1', '');
  private readonly auth = inject(AuthService) as AuthService & AuthTokenBridge;

  /**
   * Streams SSE events from a POST endpoint.
   * Block format per mock-backend/src/sse.ts: `event: NAME\ndata: {json}\n\n`
   * (payload carries a `type` field used as the ev. name fallback).
   *
   * Aborting via `signal` cancels the fetch, closes the reader and releases the
   * stream lock. Mid-stream `ERROR` events are yielded first, then the
   * generator throws so consumers observe the failure as an error.
   *
   * A 401 on the initial connect triggers exactly one `AuthService.refreshToken()`
   * (single-flight) + one retry with the fresh token. A second 401 is thrown as-is.
   */
  async *connect<T extends SseEventPayload>(
    url: string,
    body: unknown,
    signal?: AbortSignal,
  ): AsyncGenerator<SseEvent<T>, void, unknown> {
    let response = await this.openStream(url, body, signal, await this.getFreshToken());

    if (response?.status === 401) {
      const refreshed = await this.refreshAuth();
      if (refreshed) {
        // Drop the unauthorized response before retrying the initial connect.
        await this.discardBody(response);
        response = await this.openStream(url, body, signal, await this.getFreshToken());
      }
    }

    // Aborted during the connection phase (openStream returns null).
    if (!response) return;

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new SseConnectError(toApiError(errorBody ?? { message: 'SSE connection failed' }, response.status));
    }

    const reader = response.body?.getReader();
    if (!reader) throw new SseConnectError(toApiError({ message: 'No response body' }));

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; leftover partial block stays buffered.
        let separator: number;
        while ((separator = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);

          const event = this.parseSseBlock<T>(block);
          if (!event) continue;

          yield event;

          // Mid-stream failure: yield the ERROR event, then surface it as an error.
          if (event.event === 'ERROR') {
            const payload = event.data as ErrorPayload;
            throw new SseConnectError(toApiError({ error: payload.code, message: payload.message }));
          }
        }
      }
    } catch (error) {
      // Graceful abort (fetch rejects with AbortError once the signal fires).
      if (signal?.aborted) return;
      throw error;
    } finally {
      try {
        if (!reader.closed) await reader.cancel();
      } catch {
        // reader already cancelled or errored
      }
      reader.releaseLock();
    }
  }

  private async getFreshToken(): Promise<string> {
    const token = await this.auth.getFreshToken();
    return typeof token === 'string' ? token : '';
  }

  /**
   * Performs the initial POST. Returns `null` when the caller aborted during
   * the connection phase (graceful no-op, mirrors the read-loop handling).
   */
  private async openStream(
    url: string,
    body: unknown,
    signal: AbortSignal | undefined,
    token: string,
  ): Promise<Response | null> {
    try {
      return await fetch(`${this.baseUrl}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) return null;
      throw error;
    }
  }

  /** Refresh via AuthService's single-flight path; never throws (false on failure). */
  private async refreshAuth(): Promise<boolean> {
    try {
      return await this.auth.refreshToken();
    } catch {
      return false;
    }
  }

  private async discardBody(response: Response): Promise<void> {
    try {
      await response.body?.cancel();
    } catch {
      // body already consumed/cancelled
    }
  }

  private parseSseBlock<T extends SseEventPayload>(block: string): SseEvent<T> | null {
    let eventName: SseEventName | null = null;
    const dataLines: string[] = [];

    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() as SseEventName;
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) dataLines.push(data);
      }
    }

    if (dataLines.length === 0) return null;

    try {
      const payload = JSON.parse(dataLines.join('\n')) as T;
      // `event:` line is authoritative; payload `type` is the fallback.
      const event = (eventName ?? (payload as SseEventPayload).type) as SseEventName | undefined;
      if (!event) return null;
      return { event, data: payload };
    } catch {
      return null;
    }
  }

  // Convenience methods returning async generators
  initAssessment(signal?: AbortSignal): AsyncGenerator<SseEvent, void, unknown> {
    return this.connect('/api/v1/chat/init-assessment', {}, signal);
  }

  generateDraft(ratings: Array<{ skillId: string; rating: number }>, plannedTasks = '', signal?: AbortSignal): AsyncGenerator<SseEvent, void, unknown> {
    return this.connect('/api/v1/chat/generate-draft', { ratings, plannedTasks }, signal);
  }

  refineDraft(message: string, signal?: AbortSignal): AsyncGenerator<SseEvent, void, unknown> {
    return this.connect('/api/v1/chat/refine-draft', { message }, signal);
  }

  /**
   * Пошаговый диалог заполнения ИПР. Без message — старт (первый вопрос);
   * с message — ответ пользователя и следующий вопрос.
   */
  dialog(message?: string, signal?: AbortSignal): AsyncGenerator<SseEvent, void, unknown> {
    return this.connect('/api/v1/chat/dialog', message ? { message } : {}, signal);
  }
}
