import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { SseService, SseConnectError } from './sse.service';
import { SseEvent, SseEventPayload } from '../../models/idp.models';

/**
 * D-2 unit tests for the SSE block parser of `SseService`.
 * `connect` is exercised through its public async generator; `fetch` is mocked
 * (jsdom global, fetch exists in Node >= 18) with a stream of encoded chunks.
 */

describe('SseService.connect', () => {
  const sse = (blocks: string): string => `${blocks}\n\n`;

  /** A Response-like object backed by a real ReadableStream of text chunks. */
  function sseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return { ok: true, status: 200, json: () => Promise.resolve({}), body: stream } as unknown as Response;
  }

  let fetchMock: ReturnType<typeof vi.fn>;
  let capturedInit: RequestInit | undefined;
  let authStub: {
    getFreshToken: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authStub = {
      getFreshToken: vi.fn().mockResolvedValue('test-token'),
      refreshToken: vi.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
      ],
    });
    capturedInit = undefined;
    fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return sseResponse(['']);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  interface RunResult {
    events: SseEvent[];
    error?: unknown;
  }

  async function drainGen(gen: AsyncGenerator<SseEvent, void, unknown>): Promise<RunResult> {
    const events: SseEvent[] = [];
    try {
      for await (const event of gen) events.push(event);
    } catch (error) {
      return { events, error };
    }
    return { events };
  }

  it('parses typed SSE blocks, with and without an event: line', async () => {
    fetchMock.mockImplementation(async () =>
      sseResponse([
        sse('event: STAGE_UPDATE\ndata: {"type":"STAGE_UPDATE","stage":"STAGE_2_QUESTIONNAIRE","stepNumber":2,"totalSteps":5}'),
        sse('data: {"type":"MESSAGE_DELTA","messageId":"m1","delta":"Hel"}'),
      ]),
    );

    const { events, error } = await drainGen(TestBed.inject(SseService).connect('/api/v1/chat/x', {}));

    expect(error).toBeUndefined();
    expect(events).toEqual([
      {
        event: 'STAGE_UPDATE',
        data: { type: 'STAGE_UPDATE', stage: 'STAGE_2_QUESTIONNAIRE', stepNumber: 2, totalSteps: 5 },
      },
      { event: 'MESSAGE_DELTA', data: { type: 'MESSAGE_DELTA', messageId: 'm1', delta: 'Hel' } },
    ]);
    // Discrimination of the second event comes from the payload type fallback.
    const second = events[1] as SseEvent<SseEventPayload>;
    expect(second.event).toBe('MESSAGE_DELTA');
    expect((second.data as { messageId: string }).messageId).toBe('m1');
    expect((second.data as { delta: string }).delta).toBe('Hel');
  });

  it('prefers the event: line over the payload type', async () => {
    fetchMock.mockImplementation(async () =>
      sseResponse([sse('event: STAGE_UPDATE\ndata: {"type":"DONE"}')]),
    );

    const { events } = await drainGen(TestBed.inject(SseService).connect('/api/v1/chat/x', {}));
    expect(events).toEqual([{ event: 'STAGE_UPDATE', data: { type: 'DONE' } }]);
  });

  it('parses PLAN_DRAFT_UPDATE and keeps a partial frame buffered across chunks', async () => {
    const full = 'event: PLAN_DRAFT_UPDATE\ndata: {"type":"PLAN_DRAFT_UPDATE","plan":{"mainGoal":"G","directions":[]}}\n\n';
    const splitAt = full.indexOf('"plan"');
    expect(splitAt).toBeGreaterThan(0);
    fetchMock.mockImplementation(async () => sseResponse([full.slice(0, splitAt), full.slice(splitAt)]));

    const { events, error } = await drainGen(TestBed.inject(SseService).connect('/api/v1/chat/x', {}));
    expect(error).toBeUndefined();
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('PLAN_DRAFT_UPDATE');
    expect((events[0].data as { plan: { mainGoal: string } }).plan.mainGoal).toBe('G');
  });

  it('skips blocks with invalid JSON or no data line', async () => {
    fetchMock.mockImplementation(async () =>
      sseResponse([
        'data: {not-json\n\n',
        'event: MESSAGE_DELTA\ndata:\n\n',
        sse('data: {"type":"MESSAGE_DELTA","messageId":"m2","delta":"ok"}'),
      ]),
    );

    const { events } = await drainGen(TestBed.inject(SseService).connect('/api/v1/chat/x', {}));
    expect(events).toEqual([{ event: 'MESSAGE_DELTA', data: { type: 'MESSAGE_DELTA', messageId: 'm2', delta: 'ok' } }]);
  });

  it('yields a mid-stream ERROR event, then throws SseConnectError and releases the reader', async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const reader = {
      closed: false,
      read: () => Promise.resolve({ done: false, value: new TextEncoder().encode('') }),
      cancel,
      releaseLock,
    };
    let encodeFrame = '';
    const encoder = new TextEncoder();
    reader.read = () =>
      Promise.resolve({ done: false, value: encoder.encode(encodeFrame) });

    const body = { getReader: () => reader };
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      body,
    }) as unknown as Response);

    const gen = TestBed.inject(SseService).connect('/api/v1/chat/x', {});
    const events: SseEvent[] = [];

    // First block: a stage update that must be yielded.
    encodeFrame = sse('event: STAGE_UPDATE\ndata: {"type":"STAGE_UPDATE","stage":"STAGE_3_DRAFT_GEN","stepNumber":3,"totalSteps":5}');
    const first = await gen.next();
    expect(first.done).toBe(false);
    events.push(first.value as SseEvent);

    // Second block: an ERROR event — yielded, then the generator throws.
    encodeFrame = sse('event: ERROR\ndata: {"type":"ERROR","code":"LLM_TIMEOUT","message":"LLM did not respond"}');
    const second = await gen.next();
    expect(second.done).toBe(false);
    events.push(second.value as SseEvent);

    const third = { done: false as boolean, err: undefined as unknown };
    try {
      const result = await gen.next(); // surfaces the error as a rejection
      expect(result.done).toBe(true);
    } catch (error) {
      third.done = true;
      third.err = error;
    }
    expect(third.done).toBe(true);
    expect(third.err).toBeInstanceOf(SseConnectError);
    const connectError = third.err as SseConnectError;
    expect(connectError.apiError.code).toBe('LLM_TIMEOUT');
    expect(connectError.message).toBe('LLM did not respond');

    expect(events[0].event).toBe('STAGE_UPDATE');
    expect((events[0].data as { stage: string }).stage).toBe('STAGE_3_DRAFT_GEN');
    expect(events[1].event).toBe('ERROR');
    expect((events[1].data as { code: string }).code).toBe('LLM_TIMEOUT');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('throws SseConnectError with a typed ApiError on a non-2xx response', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ error: 'VALIDATION_ERROR', message: 'Bad plan' }),
    }) as unknown as Response);

    let caught: unknown;
    try {
      for await (const _ of TestBed.inject(SseService).connect('/api/v1/chat/x', {})) { /* skip */ }
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SseConnectError);
    const connectError = caught as SseConnectError;
    expect(connectError.apiError.code).toBe('VALIDATION_ERROR');
    expect(connectError.apiError.status).toBe(422);
    expect(connectError.message).toBe('Bad plan');
  });

  it('refreshes once and retries the initial connect on 401', async () => {
    authStub.getFreshToken
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    authStub.refreshToken.mockResolvedValue(true);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized', message: 'Token expired' }),
      } as unknown as Response)
      .mockResolvedValueOnce(sseResponse([sse('data: {"type":"DONE"}')]));

    const { events, error } = await drainGen(TestBed.inject(SseService).connect('/api/v1/chat/x', {}));

    expect(error).toBeUndefined();
    expect(events).toEqual([{ event: 'DONE', data: { type: 'DONE' } }]);
    expect(authStub.refreshToken).toHaveBeenCalledTimes(1);
    expect(authStub.getFreshToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryHeaders = (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer fresh-token');
  });

  it('throws the second 401 after exactly one refresh+retry', async () => {
    authStub.refreshToken.mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized', message: 'Token expired' }),
    } as unknown as Response);

    let caught: unknown;
    try {
      for await (const _ of TestBed.inject(SseService).connect('/api/v1/chat/x', {})) { /* skip */ }
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SseConnectError);
    const connectError = caught as SseConnectError;
    expect(connectError.apiError.code).toBe('unauthorized');
    expect(connectError.apiError.status).toBe(401);
    expect(authStub.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the refresh fails (401 thrown as before)', async () => {
    authStub.refreshToken.mockResolvedValue(false);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized', message: 'Token expired' }),
    } as unknown as Response);

    let caught: unknown;
    try {
      for await (const _ of TestBed.inject(SseService).connect('/api/v1/chat/x', {})) { /* skip */ }
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SseConnectError);
    expect((caught as SseConnectError).apiError.status).toBe(401);
    expect(authStub.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('completes without error and skips cleanup when the signal fires during a failed fetch', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }),
    );

    const gen = TestBed.inject(SseService).connect('/api/v1/chat/x', {}, controller.signal);
    const pending = gen.next();
    // Let the fetch call (and with it the abort listener) register first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const result = await pending;
    expect(result.done).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it('aborts mid-stream, releases the reader and does not throw', async () => {
    const controller = new AbortController();
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const reader = {
      closed: false,
      read: () =>
        new Promise<{ done: boolean; value?: Uint8Array }>((_resolve, reject) => {
          // The pending read aborts together with the signal (fetch semantics).
          controller.signal.addEventListener('abort', () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }),
      cancel,
      releaseLock,
    };
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      body: { getReader: () => reader },
    }) as unknown as Response);

    const gen = TestBed.inject(SseService).connect('/api/v1/chat/x', {}, controller.signal);
    const pending = gen.next();
    // Let fetch resolve and reader.read() attach its abort listener first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    const result = await pending;
    expect(result.done).toBe(true);
    expect(result.value).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('sends POST with JSON body and bearer auth headers (generateDraft convenience)', async () => {
    fetchMock.mockImplementation(async () => sseResponse(['']));
    for await (const _ of TestBed.inject(SseService).generateDraft([{ skillId: 's1', rating: 4 }], 'мои рабочие задачи')) { /* skip */ }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/v1/chat/generate-draft');
    expect(init.method).toBe('POST');
    expect((init.body as string)).toBe(JSON.stringify({ ratings: [{ skillId: 's1', rating: 4 }], plannedTasks: 'мои рабочие задачи' }));
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('text/event-stream');
    expect(headers['Authorization']).toBe('Bearer test-token');
  });
});
