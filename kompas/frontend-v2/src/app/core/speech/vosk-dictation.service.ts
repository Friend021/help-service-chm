import { Injectable } from '@angular/core';
// Только типы (стираются при компиляции). Сам модуль (~5.8 МБ WASM-обёртки)
// грузится динамически в loadModel() — вне основного бандла и вне тестов.
import type { Model, KaldiRecognizer } from 'vosk-browser';

/** Колбэки распознавания: промежуточный (partial) и финальный (result) текст. */
export interface DictationHandlers {
  onPartial: (text: string) => void;
  onResult: (text: string) => void;
}

/**
 * Офлайн-распознавание речи целиком в браузере через vosk-browser (WASM в WebWorker).
 * Аудио НЕ покидает устройство. Модель (русская small, ~46 МБ) лежит в
 * public/models и грузится один раз, затем кэшируется на время жизни вкладки.
 *
 * Пайплайн микрофона: getUserMedia → AudioContext → ScriptProcessor →
 * recognizer.acceptWaveform(AudioBuffer). Воркер ресемплит чанк к 16 кГц модели.
 */
@Injectable({ providedIn: 'root' })
export class VoskDictationService {
  private static readonly MODEL_PATH = 'models/vosk-model-small-ru-0.22.tar.gz';
  /** Частота модели vosk (обучена на 16 кГц). */
  private static readonly MODEL_SAMPLE_RATE = 16000;

  private model: Model | null = null;
  private modelPromise: Promise<Model> | null = null;
  private recognizer: KaldiRecognizer | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  /** Поддерживает ли браузер микрофон + WebAudio (нужно для vosk-browser). */
  static get supported(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function'
      && typeof AudioContext !== 'undefined';
  }

  /** Грузит модель один раз (≈46 МБ — первый вызов долгий), дальше из кэша. */
  loadModel(): Promise<Model> {
    if (this.model) {
      return Promise.resolve(this.model);
    }
    if (!this.modelPromise) {
      const url = new URL(VoskDictationService.MODEL_PATH, document.baseURI).href;
      this.modelPromise = import('vosk-browser')
        .then(({ createModel }) => createModel(url))
        .then((model) => {
          this.model = model;
          return model;
        })
        .catch((error) => {
          // Сброс, чтобы следующий клик попробовал заново.
          this.modelPromise = null;
          throw error;
        });
    }
    return this.modelPromise;
  }

  /** Старт диктовки: грузит модель (если нужно), открывает микрофон, стримит в распознаватель. */
  async start(handlers: DictationHandlers): Promise<void> {
    const model = await this.loadModel();

    const recognizer = new model.KaldiRecognizer(VoskDictationService.MODEL_SAMPLE_RATE);
    recognizer.on('result', (message) => {
      if (message.event === 'result') {
        handlers.onResult(message.result.text ?? '');
      }
    });
    recognizer.on('partialresult', (message) => {
      if (message.event === 'partialresult') {
        handlers.onPartial(message.result.partial ?? '');
      }
    });
    this.recognizer = recognizer;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: VoskDictationService.MODEL_SAMPLE_RATE,
      },
    });
    this.stream = stream;

    const audioContext = new AudioContext();
    this.audioContext = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    this.source = source;
    // ScriptProcessor помечен deprecated, но это самый совместимый путь и он
    // прямо показан в README vosk-browser; AudioWorklet оставим на потом.
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = (event) => {
      try {
        recognizer.acceptWaveform(event.inputBuffer);
      } catch {
        // отдельный плохой чанк не должен ронять запись
      }
    };
    source.connect(processor);
    // Подключаем к destination, иначе в части браузеров onaudioprocess не вызывается.
    processor.connect(audioContext.destination);
  }

  /** Останавливает запись и освобождает микрофон/аудио-граф/распознаватель. Модель остаётся в кэше. */
  stop(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try { this.processor.disconnect(); } catch { /* уже отключён */ }
    }
    try { this.source?.disconnect(); } catch { /* уже отключён */ }
    try { this.stream?.getTracks().forEach((track) => track.stop()); } catch { /* нет треков */ }
    try { this.audioContext?.close(); } catch { /* уже закрыт */ }
    try { this.recognizer?.remove(); } catch { /* уже удалён */ }
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.audioContext = null;
    this.recognizer = null;
  }
}
