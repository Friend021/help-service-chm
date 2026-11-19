import { Component, inject, computed, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { SkillRatingComponent } from '../../../shared/components/skill-rating/skill-rating.component';
import { StageIndicatorComponent } from '../../../shared/components/stage-indicator/stage-indicator.component';
import { ChatMessageComponent } from '../../../shared/components/chat-message/chat-message.component';
import { GenerationOverlayComponent } from '../../../shared/components/generation-overlay/generation-overlay.component';
import { VoskDictationService } from '../../../core/speech/vosk-dictation.service';
import { WorkflowStage } from '../../../models/idp.models';

/**
 * Upper bound for waiting on a foreign stream (auto-init) before generating.
 * After it the workflow's cancel-and-replace handles the race.
 */
const STREAM_IDLE_TIMEOUT_MS = 15_000;

@Component({
  selector: 'app-assessment',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    SkillRatingComponent,
    StageIndicatorComponent,
    ChatMessageComponent,
    GenerationOverlayComponent,
  ],
  template: `
    @if (pendingAction() === 'generate') {
      <app-generation-overlay />
    }
    <div class="assessment-page">
      <div class="assessment-scroll">
      <div class="assessment-inner">
      <app-stage-indicator
        [currentStage]="store.currentStage()"
        [steps]="store.stageLabels()"
        (navigate)="onStageNavigate($event)"
      />

      <div class="assessment-content">
        <!--
          Чат живёт своей жизнью: он появляется, как только есть переписка или
          активен поток, и НЕ подменяет опросник. Раньше карточки были
          взаимоисключающими (@if isStreaming / @else questionnaire), из-за чего
          каждый старт/останов SSE пересоздавал весь блок — визуальное мигание.
        -->
        @if (store.messages().length > 0 || store.isStreaming()) {
          <mat-card class="chat-card" appearance="outlined">
            <mat-card-header>
              <mat-card-title>AI Ассистент</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="chat-messages">
                @for (msg of store.messages(); track msg.id) {
                  <app-chat-message [message]="msg" [isStreaming]="store.currentStreamingMessageId() === msg.id" />
                }
              </div>
            </mat-card-content>
          </mat-card>
        }

        <!--
          Опросник смонтирован всё время, пока есть навыки. Поток только
          блокирует действия (disabled + спиннер в нажатой кнопке), но никогда
          не размонтирует карточку.
        -->
        @if (store.skills().length > 0) {
          <mat-card class="questionnaire-card" appearance="outlined">
            <mat-card-header>
              <mat-card-title>Опросник компетенций</mat-card-title>
              <mat-card-subtitle>
                Оцените ваш текущий уровень по каждому навыку от 1 до 5.
                {{ ratedCount() }} из {{ store.skills().length }} оценено.
              </mat-card-subtitle>
            </mat-card-header>

            <mat-card-content>
              <div class="skills-grid">
                @for (skill of store.skills(); track skill.skillId) {
                  <app-skill-rating
                    [skill]="skill"
                    [rating]="store.getRating(skill.skillId) ?? null"
                    (ratingChange)="onRatingChanged(skill.skillId, $event)"
                  />
                }
              </div>

              <div class="planned-tasks">
                <label for="plannedTasks">
                  Какие рабочие задачи вы планируете выполнять, чтобы развиваться?
                  <span class="optional">необязательно</span>
                </label>
                <p class="hint">
                  Опишите реальные задачи и проекты на рабочем месте, через которые вы хотите
                  расти — ассистент учтёт их при подборе развивающих действий.
                </p>
                <div class="ptasks-input">
                  <textarea
                    id="plannedTasks"
                    rows="3"
                    [value]="store.plannedTasks()"
                    (input)="onPlannedTasksChanged($event)"
                    [disabled]="store.isStreaming()"
                    placeholder="Например: возьму на себя проектирование модуля отчётности, буду проводить код-ревью младших разработчиков, подготовлю нагрузочное тестирование сервиса…"
                  ></textarea>
                  @if (dictationSupported()) {
                    <button
                      type="button"
                      class="ptasks-mic"
                      [class.is-recording]="listening()"
                      (click)="toggleDictation()"
                      [disabled]="store.isStreaming() || dictationState() === 'loading'"
                      [attr.aria-pressed]="listening()"
                      [matTooltip]="listening() ? 'Остановить запись' : 'Надиктовать голосом (офлайн)'"
                    >
                      @if (dictationState() === 'loading') {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        <mat-icon>{{ listening() ? 'stop' : 'mic' }}</mat-icon>
                      }
                    </button>
                  }
                </div>
                @if (dictationState() === 'loading') {
                  <div class="ptasks-listening" aria-live="polite">
                    <span class="ptasks-listening__dot"></span> Загрузка голосовой модели…
                  </div>
                } @else if (listening()) {
                  <div class="ptasks-listening" aria-live="polite">
                    <span class="ptasks-listening__dot"></span> Слушаю… говорите
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>
        }

        @if (store.skills().length === 0) {
          <mat-card class="init-card" appearance="outlined">
            <mat-card-content class="centered">
              <mat-icon class="large-icon">assignment</mat-icon>
              <h3>Готовы начать?</h3>
              <p>Нажмите кнопку ниже, чтобы AI-ассистент загрузил профиль целевой должности и подготовил опросник.</p>
              <button
                mat-flat-button
                color="primary"
                (click)="initializeAssessment()"
                [disabled]="store.isStreaming() || pendingAction() !== null"
              >
                @if (pendingAction() === 'init') {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container>
                    <mat-icon>play_arrow</mat-icon>
                    Начать оценку навыков
                  </ng-container>
                }
              </button>
            </mat-card-content>
          </mat-card>
        }
      </div>
      </div>
      </div>

      @if (store.skills().length > 0) {
        <div class="assess-foot-wrap">
          <footer class="idp-actionbar assess-foot">
            <button mat-button type="button" (click)="goBack()" [disabled]="store.isStreaming()">
              <mat-icon>arrow_back</mat-icon>
              Назад
            </button>
            <span class="idp-actionbar__spacer"></span>
            <button
              mat-flat-button
              color="primary"
              [disabled]="!store.allSkillsRated() || store.isStreaming() || pendingAction() !== null"
              (click)="generateDraft()"
            >
              @if (pendingAction() === 'generate') {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <ng-container>
                  <mat-icon>assignment</mat-icon>
                  Сформировать черновик ИПР
                </ng-container>
              }
            </button>
          </footer>
        </div>
      }
    </div>
  `,
  styles: [`
    // Карточки: внутренние отступы 16px, действия отделены 16px снизу — единый ритм ДС
    .assessment-page {
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    /* Скроллится только контент; подвал вынесен из скролла и всегда внизу. */
    .assessment-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }

    .assessment-inner {
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px 24px 16px;
    }

    /* Подвал — вне прокрутки, прижат к низу (как в черновике). */
    .assess-foot-wrap {
      flex: 0 0 auto;
      max-width: 1000px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .assess-foot {
      border-radius: 12px 12px 0 0;
    }

    .assessment-content {
      margin-top: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .chat-card {
      max-height: 300px;
    }

    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
      padding: 8px 0;
    }

    .questionnaire-card {
      width: 100%;
    }

    // Опросник — один столбец карточек (как в макете Red elephant).
    .skills-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    // Серый контейнер вокруг белых карточек компетенций (как в макете).
    .questionnaire-card {
      background: #eef0f3;
      border-color: #e3e6ea;
    }

    .planned-tasks {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .planned-tasks label {
      font-weight: 500;
      color: var(--mat-sys-on-surface);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .planned-tasks .optional {
      font-weight: 400;
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      background: var(--mat-sys-surface-container-high);
      padding: 2px 8px;
      border-radius: 10px;
    }

    .planned-tasks .hint {
      margin: 0;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .planned-tasks textarea {
      margin-top: 4px;
      width: 100%;
      resize: vertical;
      min-height: 72px;
      padding: 10px 12px;
      font: inherit;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface);
      border: 1px solid var(--mat-sys-outline);
      border-radius: 8px;
      box-sizing: border-box;
    }

    .planned-tasks textarea:focus {
      outline: none;
      border-color: var(--mat-sys-primary);
    }

    .planned-tasks textarea:disabled {
      opacity: 0.6;
    }

    /* Поле с микрофоном: кнопка в правом нижнем углу текстового поля. */
    .ptasks-input {
      position: relative;
    }

    .ptasks-input textarea {
      /* место под кнопку микрофона, чтобы текст её не задевал */
      padding-right: 48px;
    }

    .ptasks-mic {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 50%;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .ptasks-mic:hover:not(:disabled) {
      color: var(--mat-sys-primary);
      border-color: var(--mat-sys-primary);
    }

    .ptasks-mic:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ptasks-mic mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .ptasks-mic.is-recording {
      background: var(--mat-sys-error);
      border-color: var(--mat-sys-error);
      color: #fff;
      animation: ptasks-pulse 1.3s ease-in-out infinite;
    }

    @keyframes ptasks-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.5); }
      50% { box-shadow: 0 0 0 6px rgba(229, 57, 53, 0); }
    }

    .ptasks-listening {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .ptasks-listening__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mat-sys-error);
      animation: ptasks-pulse 1.3s ease-in-out infinite;
    }

    .init-card {
      width: 100%;
    }

    .init-card mat-card-content {
      min-height: 300px;
    }

    .centered {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 16px;
      padding: 32px 0;
    }

    .large-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--mat-sys-primary);
    }

    .centered h3 {
      margin: 0;
      font-size: 1.5rem;
      color: var(--mat-sys-on-surface);
    }

    .centered p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      max-width: 500px;
    }

    // Единый внутренний отступ контента карточки: 16px по бокам.
    // Нижние 8px + верхние 8px у mat-card-actions дают 16px между блоками.
    mat-card-content {
      padding: 0 16px 8px;
    }

    // Контент — последний блок карточки (чат, старт): снизу те же 16px.
    mat-card-content:last-child {
      padding-bottom: 16px;
    }

    // Действия: 16px снизу до границы карточки и 16px по бокам.
    mat-card-actions {
      padding: 8px 16px 16px;
      margin: 0;
      gap: 12px;
    }
  `],
})
export class AssessmentComponent implements AfterViewInit, OnDestroy {
  private readonly store = inject(IdpStoreService);
  private readonly workflow = inject(IdpWorkflowService);
  private readonly router = inject(Router);
  private readonly vosk = inject(VoskDictationService);

  /**
   * Which primary action is in flight. Drives ONLY the in-button spinner, so a
   * stream never unmounts a card and the spinner always belongs to the button
   * the user actually pressed.
   */
  readonly pendingAction = signal<'init' | 'generate' | null>(null);

  /** Голосовой ввод планируемых задач (vosk-browser, офлайн): состояние диктовки. */
  readonly dictationState = signal<'idle' | 'loading' | 'listening'>('idle');
  readonly listening = computed(() => this.dictationState() === 'listening');
  /** Поддерживается ли офлайн-диктовка (микрофон + WebAudio). */
  readonly dictationSupported = signal(VoskDictationService.supported);
  /** Текст поля на момент старта диктовки — к нему дописываем распознанное. */
  private dictationBase = '';
  /** Накопленный финальный текст текущей сессии диктовки (между фразами). */
  private dictationFinal = '';

  ngAfterViewInit(): void {
    // Auto-initialize the SSE flow (once — skipped when skills exist or a
    // stream is already running) via the workflow orchestrator.
    if (this.store.skills().length === 0 && !this.store.isStreaming()) {
      // Error mid-stream is already surfaced as an assistant message by the
      // workflow; swallow the rejection to keep it fire-and-forget.
      void this.runAction('init', () => this.workflow.initializeAssessment());
    }
  }

  ngOnDestroy(): void {
    // Не обрываем поток здесь: при переходе на /idp/draft следующий экран уже
    // мог запустить свой SSE (диалог заполнения), и cancel убил бы его.
    // Активный поток отменяется при выходе из /idp (idp-shell) или старте
    // нового потока (consumeStream).
    this.vosk.stop();
  }

  /** Старт/стоп голосовой диктовки (офлайн, vosk-browser) в поле планируемых задач. */
  async toggleDictation(): Promise<void> {
    if (this.dictationState() !== 'idle') {
      this.stopDictation();
      return;
    }
    // Дописываем к уже введённому тексту (ручному или прошлой диктовки).
    const base = this.store.plannedTasks().trim();
    this.dictationBase = base ? base + ' ' : '';
    this.dictationFinal = '';
    this.dictationState.set('loading');
    try {
      await this.vosk.start({
        // Промежуточный результат текущей фразы: показываем поверх уже финализированного.
        onPartial: (text) => {
          const tail = this.dictationFinal ? this.dictationFinal + ' ' : '';
          this.store.plannedTasks.set(this.dictationBase + tail + text);
        },
        // Фраза завершена: фиксируем её в финальный текст.
        onResult: (text) => {
          if (text) {
            this.dictationFinal = this.dictationFinal ? this.dictationFinal + ' ' + text : text;
          }
          this.store.plannedTasks.set(this.dictationBase + this.dictationFinal);
        },
      });
      this.dictationState.set('listening');
    } catch {
      this.dictationState.set('idle');
    }
  }

  private stopDictation(): void {
    this.vosk.stop();
    this.dictationState.set('idle');
  }

  ratedCount = computed(() =>
    this.store.skills().filter(s => typeof s.rating === 'number').length
  );

  /** Single source of truth: store ratings map (drives generateDraft). */
  onRatingChanged(skillId: string, rating: number | null): void {
    if (rating !== null) {
      this.store.updateRating(skillId, rating);
      return;
    }
    // Rating cleared: remove from map and clear on the skill object.
    this.store.ratings.update(map => {
      const next = new Map(map);
      next.delete(skillId);
      return next;
    });
    this.store.skills.update(skills =>
      skills.map(s => (s.skillId === skillId ? { ...s, rating: null } : s))
    );
  }

  /** Свободный текст планируемых рабочих задач → store (едет в generate-draft). */
  onPlannedTasksChanged(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.store.plannedTasks.set(value);
  }

  initializeAssessment(): void {
    void this.runAction('init', () => this.workflow.initializeAssessment());
  }

  async generateDraft(): Promise<void> {
    await this.runAction('generate', async () => {
      // The auto-init stream from ngAfterViewInit may still be running when the
      // user hits generate. Wait for it to settle so two streams never race
      // (each start/stop used to toggle the whole layout); the workflow also
      // cancels-and-replaces, but that path is a last resort, not the norm.
      await this.waitForStreamIdle();
      await this.workflow.generateDraft();
      // Only advance once the backend produced a draft; otherwise failures stay
      // visible on this page (assistant error message).
      if (this.store.directionsCount() > 0) {
        await this.router.navigate(['/idp/draft']);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/idp/onboarding']);
  }

  /**
   * Serialises the page's primary actions and owns `pendingAction`, so a second
   * click cannot launch a parallel stream. Rejections are swallowed: the
   * workflow already surfaces failures as assistant chat messages.
   */
  private async runAction(action: 'init' | 'generate', run: () => Promise<void>): Promise<void> {
    if (this.pendingAction() !== null) return;
    this.pendingAction.set(action);
    try {
      await run();
    } catch {
      // Surfaced as a chat message by the workflow.
    } finally {
      this.pendingAction.set(null);
    }
  }

  /**
   * Resolves once no SSE stream is running. The bounded timeout is a safety net:
   * if a stream hangs, the workflow's cancel-and-replace path takes over instead
   * of blocking generation forever.
   */
  private async waitForStreamIdle(timeoutMs = STREAM_IDLE_TIMEOUT_MS): Promise<void> {
    const startedAt = Date.now();
    while (this.store.isStreaming()) {
      if (Date.now() - startedAt >= timeoutMs) return;
      await new Promise<void>(resolve => setTimeout(resolve, 50));
    }
  }

  onStageNavigate(stage: WorkflowStage): void {
    if (!this.workflow.canActivateStage(stage)) return;
    if (stage === 'STAGE_1_CONTEXT' || stage === 'STAGE_1_2_ONBOARDING') {
      this.goBack();
    }
  }
}