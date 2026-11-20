import { Component, inject, computed, signal, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, OnInit, DestroyRef, HostListener, DOCUMENT } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmPlanDialogComponent } from '../../../shared/components/confirm-plan-dialog/confirm-plan-dialog.component';
import { ExportSuccessDialogComponent } from '../../../shared/components/export-success-dialog/export-success-dialog.component';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { ChatMessageComponent } from '../../../shared/components/chat-message/chat-message.component';
import { DirectionCardComponent } from '../../../shared/components/direction-card/direction-card.component';
import { Dictionaries, IdpDirection, IdpPlan, IdpTask, WorkflowStage, ValidationError } from '../../../models/idp.models';
import { planPathSegments } from '../../../shared/components/task-editor/task-editor.component';

interface ValidationIssue {
  fieldId: string;
  message: string;
  kind: 'mainGoal' | 'directionGoal' | 'directionDescription' | 'taskTool' | 'taskDeadline' | 'taskDescription' | 'noTasks';
}

@Component({
  selector: 'app-draft',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    ChatMessageComponent,
    DirectionCardComponent,
    CdkDropList,
  ],
  template: `
    <div class="draft-page">
      <!-- Единственная колонка: план + прижатый подвал -->
      <div class="plan-scroll">
        <mat-card class="plan-card idp-plan" appearance="outlined">
          <mat-card-content>
          @if (store.directionsCount() === 0) {
            <div class="empty-plan">
              <mat-icon>description</mat-icon>
              <p>Черновик ещё формируется</p>
              <p class="empty-plan__hint">Ответьте на вопросы ассистента — ИПР заполнится автоматически.</p>
              <button mat-flat-button color="primary" (click)="openChat()">
                <mat-icon>chat</mat-icon>
                Открыть ассистента
              </button>
            </div>
          } @else {
            <div class="plan-editor">
              <div class="plan-header">
                <mat-form-field
                  id="main-goal-input"
                  appearance="outline"
                  class="goal-field"
                  [class.field-invalid]="mainGoalError() !== null || invalidIds().has('main-goal-input')"
                  [class.field-flash]="flashingId() === 'main-goal-input'"
                  subscriptSizing="dynamic"
                >
                  <mat-label>Ключевая цель ИПР</mat-label>
                  <textarea
                    matInput
                    rows="2"
                    [(ngModel)]="mainGoal"
                    (ngModelChange)="onGoalChange($event)"
                    [attr.aria-invalid]="mainGoalError() !== null || invalidIds().has('main-goal-input')"
                    [attr.aria-describedby]="(mainGoalError() !== null || invalidIds().has('main-goal-input')) ? 'main-goal-error' : null"
                  ></textarea>
                </mat-form-field>
                @if (mainGoalError(); as goalError) {
                  <div id="main-goal-error" class="field-error" role="alert">{{ goalError.message }}</div>
                } @else if (invalidIds().has('main-goal-input')) {
                  <div id="main-goal-error" class="field-error" role="alert">Укажите ключевую цель ИПР</div>
                }

                @if (validationIssues().length > 0) {
                  <button
                    type="button"
                    class="validation-banner"
                    (click)="onValidationBannerClick()"
                    [attr.aria-label]="'Незаполненных обязательных полей: ' + validationIssues().length + '. Перейти к первому.'"
                  >
                    <mat-icon color="warn">warning</mat-icon>
                    <span style="flex:1">Есть незаполненные обязательные поля ({{ validationIssues().length }})</span>
                    <mat-icon aria-hidden="true">chevron_right</mat-icon>
                  </button>
                }
              </div>

              <mat-divider></mat-divider>

              <div
                class="directions-list"
                cdkDropList
                [cdkDropListData]="store.draft().directions"
                (cdkDropListDropped)="onDirectionReorder($event)"
              >
                @for (direction of store.draft().directions; track $index; let i = $index) {
                  <app-direction-card
                    [direction]="direction"
                    [index]="i"
                    [reorderable]="false"
                    [dictionaries]="dictionaries()"
                    [taskErrors]="taskErrors().get(i) ?? null"
                    [invalidFields]="directionInvalidFields().get(i) ?? null"
                    [flashingId]="flashingId()"
                    [collapsedTasks]="collapsedTasks()"
                    (update)="onDirectionUpdate($event)"
                    (delete)="onDirectionDelete($event)"
                    (addTask)="onAddTask($event)"
                    (taskUpdate)="onTaskUpdate($event)"
                    (taskDelete)="onTaskDelete($event)"
                    (toggleTaskCollapse)="toggleTaskCollapse($event.dirIndex, $event.taskIndex)"
                  />
                }
              </div>

              <div class="add-direction">
                <button mat-stroked-button (click)="addDirection()">
                  <mat-icon>add</mat-icon>
                  Добавить направление
                </button>
              </div>
            </div>
          }
          </mat-card-content>
        </mat-card>
      </div>

      @if (store.directionsCount() > 0) {
        <footer class="idp-actionbar draft-foot">
          <button mat-button type="button" (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
            Назад
          </button>
          <button
            mat-stroked-button
            type="button"
            (click)="savePlan()"
            [disabled]="store.isStreaming() || saving() || !store.isDirty()"
          >
            <mat-icon>save</mat-icon>
            Сохранить черновик
          </button>
          <span class="idp-actionbar__spacer"></span>
          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="confirmPlan()"
            [disabled]="store.isStreaming() || confirming() || !canProceed()"
            [attr.title]="canProceed() ? null : 'Заполните обязательные поля'"
            [attr.aria-disabled]="!canProceed()"
          >
            <mat-icon>check_circle</mat-icon>
            Продолжить
          </button>
        </footer>
      }

      <!-- Плавающая кнопка-ассистент -->
      <button
        #chatFab
        type="button"
        class="chat-fab"
        [class.is-hidden]="chatOpen()"
        aria-label="AI Ассистент"
        (click)="toggleChat()"
      >
        <svg class="bot" viewBox="0 0 24 23" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.001 11.5C9.39848 11.5003 9.7796 11.6583 10.0607 11.9393C10.3417 12.2204 10.4997 12.6015 10.5 12.999V13.001C10.4997 13.3985 10.3417 13.7796 10.0607 14.0607C9.7796 14.3417 9.39848 14.4997 9.001 14.5H8.999C8.60152 14.4997 8.2204 14.3417 7.93934 14.0607C7.65828 13.7796 7.50026 13.3985 7.5 13.001V12.999C7.50026 12.6015 7.65828 12.2204 7.93934 11.9393C8.2204 11.6583 8.60152 11.5003 8.999 11.5H9.001ZM15.001 11.5C15.3985 11.5003 15.7796 11.6583 16.0607 11.9393C16.3417 12.2204 16.4997 12.6015 16.5 12.999V13.001C16.4997 13.3985 16.3417 13.7796 16.0607 14.0607C15.7796 14.3417 15.3985 14.4997 15.001 14.5H14.999C14.6015 14.4997 14.2204 14.3417 13.9393 14.0607C13.6583 13.7796 13.5003 13.3985 13.5 13.001V12.999C13.5003 12.6015 13.6583 12.2204 13.9393 11.9393C14.2204 11.6583 14.6015 11.5003 14.999 11.5H15.001Z" fill="currentColor"/><path d="M12 0C12.4396 0.000777752 12.8667 0.146379 13.2153 0.414284C13.5638 0.68219 13.8144 1.05747 13.9282 1.48209C14.0421 1.90671 14.0128 2.35701 13.8451 2.76335C13.6773 3.16968 13.3803 3.50941 13 3.73V5C17.283 5 20.865 7.992 21.775 12H22C22.5304 12 23.0391 12.2107 23.4142 12.5858C23.7893 12.9609 24 13.4696 24 14C24 14.5304 23.7893 15.0391 23.4142 15.4142C23.0391 15.7893 22.5304 16 22 16H21.775C20.865 20.008 17.283 23 13 23H11C6.717 23 3.135 20.008 2.225 16H2C1.46957 16 0.960859 15.7893 0.585786 15.4142C0.210714 15.0391 0 14.5304 0 14C0 13.4696 0.210714 12.9609 0.585786 12.5858C0.960859 12.2107 1.46957 12 2 12H2.225C3.135 7.992 6.717 5 11 5V3.73C10.6197 3.50941 10.3227 3.16968 10.1549 2.76335C9.98715 2.35701 9.95792 1.90671 10.0718 1.48209C10.1856 1.05747 10.4362 0.68219 10.7847 0.414284C11.1333 0.146379 11.5604 0.000777752 12 0ZM12 8.25C9.13 8.25 7.317 9.207 6.295 10.661C5.317 12.053 5.207 13.702 5.273 14.822C5.365 16.36 6.713 17.25 8.009 17.25H15.991C17.287 17.25 18.634 16.36 18.726 14.822C18.792 13.702 18.683 12.053 17.704 10.662C16.682 9.206 14.871 8.25 12 8.25Z" fill="currentColor"/></svg>
        <span class="cap">AI Ассистент</span>
      </button>

      <!-- Поп-ап чата «Компас» -->
      <div #chatPop class="chat-pop" [class.open]="chatOpen()" role="dialog" aria-label="Компас">
        <div class="chat-head">
          <svg class="cmp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" fill="currentColor" stroke="none"/></svg>
          <span class="ct">Компас</span>
          @if (store.dialogActive()) {
            <span class="dialog-progress">Шаг {{ dialogStepNumber() }} из {{ store.dialogTotal() }}</span>
          }
          <button type="button" class="chat-x" aria-label="Закрыть" (click)="closeChat()">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="chat-body" #chatContainer>
          @for (msg of store.messages(); track msg.id) {
            <app-chat-message [message]="msg" [isStreaming]="store.currentStreamingMessageId() === msg.id" />
          }
        </div>

        <div class="chat-foot">
          @if (store.dialogActive() && store.dialogSuggestions().length > 0) {
            <div class="chat-suggestions">
              @for (suggestion of store.dialogSuggestions(); track suggestion) {
                <button
                  type="button"
                  class="suggestion-chip"
                  [disabled]="store.isStreaming()"
                  (click)="sendSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </button>
              }
            </div>
          }
          <div class="chat-input">
            <textarea
              #chatInput
              rows="1"
              [(ngModel)]="messageText"
              (keydown)="onChatKeydown($event)"
              (input)="autoGrow($event)"
              [placeholder]="store.dialogActive() ? 'Ваш ответ…' : 'Напишите правку'"
            ></textarea>
            <button
              type="button"
              class="chat-send"
              aria-label="Отправить"
              [disabled]="!messageText.trim() || store.isStreaming()"
              (click)="sendMessage()"
            >
              @if (store.isStreaming()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-3-7-7-1z"/></svg>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: 0; }

    .draft-page {
      position: relative;
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Прокручиваемая область плана; подвав прижат к низу колонки. */
    .plan-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 22px 24px 12px;
    }

    .plan-card {
      display: flex;
      flex-direction: column;
      max-width: 1000px;
      width: 100%;
      margin: 0 auto;
      --mat-form-field-container-height: 40px;
      --mat-form-field-container-vertical-padding: 8px;
    }

    .plan-card > mat-card-content { display: flex; flex-direction: column; padding: 16px; }
    .plan-editor { display: flex; flex-direction: column; }
    .plan-header { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; }
    .goal-field { width: 100%; }

    .validation-banner {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      border: 0; border-radius: 8px;
      background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container);
      font-size: 0.875rem;
    }
    .field-flash { box-shadow: 0 0 0 2px var(--mat-sys-error); }
    .field-error { color: var(--mat-sys-error); font-size: 0.75rem; line-height: 1.2; }
    .field-invalid {
      --mdc-outlined-text-field-outline-color: var(--mat-sys-error);
      --mdc-outlined-text-field-focus-outline-color: var(--mat-sys-error);
    }

    .directions-list { padding: 8px 0; }
    .add-direction { padding: 8px 0; }

    .empty-plan {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; min-height: 300px; gap: 12px; text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .empty-plan mat-icon { font-size: 64px; width: 64px; height: 64px; }
    .empty-plan__hint { font-size: .875rem; }

    mat-card-content { padding: 0 16px 8px; }
    mat-card-content:last-child { padding-bottom: 16px; }

    /* Прижатый тёмный подвал: скруглён сверху, центрирован по ширине контента (1000px). */
    .draft-foot {
      flex: 0 0 auto;
      max-width: 1000px;
      width: 100%;
      margin: 0 auto;
      border-radius: 12px 12px 0 0;
    }

    /* ——— Плавающий чат ——— */
    .chat-fab {
      position: absolute; right: 30px; bottom: 74px;
      height: 56px; width: 56px; border-radius: 30px;
      background: #15a58e; border: 0; color: #fff;
      display: flex; align-items: center; justify-content: center; gap: 0; padding: 0;
      box-shadow: 0 8px 22px rgba(21,165,142,.38);
      transition: width .18s, padding .18s; z-index: 30; cursor: pointer;
    }
    .chat-fab.is-hidden { display: none; }
    .chat-fab .bot { width: 26px; height: 26px; flex: 0 0 auto; }
    .chat-fab .cap {
      max-width: 0; overflow: hidden; white-space: nowrap;
      font: 500 16px/1 var(--font-medium); opacity: 0;
      transition: max-width .18s, opacity .15s;
    }
    .chat-fab:hover { width: auto; gap: 10px; padding: 0 20px 0 16px; }
    .chat-fab:hover .cap { max-width: 160px; opacity: 1; }

    .chat-pop {
      position: absolute; right: 30px; bottom: 74px;
      width: 560px; max-width: calc(100% - 60px);
      max-height: calc(100% - 110px);
      background: #fff; border-radius: 14px;
      box-shadow: 0 18px 48px rgba(16,24,40,.28);
      overflow: hidden; display: none; flex-direction: column; z-index: 31;
    }
    .chat-pop.open { display: flex; }

    .chat-head {
      display: flex; align-items: center; gap: 10px;
      background: #15a58e; color: #fff; padding: 14px 16px; flex: 0 0 auto;
    }
    .chat-head .cmp { width: 22px; height: 22px; flex: 0 0 auto; }
    .chat-head .ct { font: 600 17px/1 var(--font-medium); }
    .chat-head .dialog-progress {
      margin-left: 4px; padding: 2px 8px; border-radius: 999px;
      background: rgba(255,255,255,.22); color: #fff;
      font: 500 12px/16px var(--font-medium); letter-spacing: .4px;
    }
    .chat-head .chat-x {
      margin-left: auto; background: transparent; border: 0; color: #fff;
      width: 28px; height: 28px; display: grid; place-items: center;
      border-radius: 6px; cursor: pointer;
    }
    .chat-head .chat-x mat-icon { width: 18px; height: 18px; font-size: 18px; line-height: 18px; }

    .chat-body {
      flex: 1 1 auto; min-height: 160px; max-height: 360px; overflow-y: auto;
      padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 16px;
    }

    .chat-foot { flex: 0 0 auto; border-top: 1px solid #eef0f2; padding: 12px 16px; }
    .chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .suggestion-chip {
      border: 1px solid var(--outline-color); border-radius: var(--radius-pill);
      background: var(--surface-color); color: var(--primary-700);
      padding: 4px 12px; font: 400 12px/16px var(--font-regular); cursor: pointer;
    }
    .suggestion-chip:hover:not(:disabled) { background: var(--primary-10); border-color: var(--primary-200); }
    .suggestion-chip:disabled { opacity: .5; cursor: default; }

    .chat-input { display: flex; align-items: flex-end; gap: 10px; }
    .chat-input textarea {
      flex: 1 1 auto; min-height: 46px; max-height: 132px;
      border: 1px solid var(--field-line, #cdd3da); border-radius: 10px; background: #fff;
      padding: 12px 16px; font: 400 15px/1.4 var(--font-regular); color: #1f2733;
      resize: none; overflow-y: auto;
    }
    .chat-input textarea::placeholder { color: #8a94a0; }
    .chat-send {
      flex: 0 0 46px; width: 46px; height: 46px; border-radius: 10px;
      background: #15a58e; border: 0; color: #fff; display: grid; place-items: center; cursor: pointer;
    }
    .chat-send:disabled { opacity: .5; cursor: default; }
    .chat-send svg { width: 20px; height: 20px; }

    @media (max-width: 720px) {
      .plan-scroll { padding: 16px 16px 10px; }
      .draft-foot { margin: 0; border-radius: 0; }
      .chat-pop { right: 16px; left: 16px; width: auto; }
      .chat-fab { right: 16px; }
    }
  `],
})
export class DraftComponent implements AfterViewInit, OnDestroy, OnInit {
  private readonly store = inject(IdpStoreService);
  private readonly workflow = inject(IdpWorkflowService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('chatContainer') chatContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatPop') chatPopRef?: ElementRef<HTMLElement>;
  @ViewChild('chatFab') chatFabRef?: ElementRef<HTMLElement>;
  @ViewChild('chatInput') chatInputRef?: ElementRef<HTMLTextAreaElement>;

  messageText = '';
  mainGoal = '';

  /** Открыт ли поп-ап ассистента. */
  readonly chatOpen = signal(false);

  /**
   * Re-syncs the goal input when something other than this editor overwrites
   * the store draft (a pushed PLAN_DRAFT_UPDATE), so the field never shows a
   * stale mainGoal.
   */
  private readonly draftSyncEffect = effect(() => {
    const storeGoal = this.store.draft().mainGoal;
    if (storeGoal !== this.mainGoal) {
      this.mainGoal = storeGoal;
    }
  });

  /** Автоскролл чата при новых сообщениях и дельтах стрима. */
  private readonly chatScrollEffect = effect(() => {
    this.store.messages();
    this.store.isStreaming();
    this.scrollToBottom();
  });

  /** Во время диалога ассистент открыт автоматически. */
  private readonly chatAutoOpenEffect = effect(() => {
    if (this.store.dialogActive()) {
      this.chatOpen.set(true);
    }
  });

  /** Guards POST /chat/confirm against double-click double-submits. */
  private readonly confirming = signal(false);

  /** Guards the «Сохранить изменения» action against double-submits. */
  private readonly saving = signal(false);

  /** Set of collapsed task keys `${dirIndex}-${taskIndex}`. */
  readonly collapsedTasks = signal<ReadonlySet<string>>(new Set());

  /** True when every required field is filled and the plan can move to confirmation. */
  readonly canProceed = computed(() => this.validationIssues().length === 0);

  isTaskCollapsed(dirIndex: number, taskIndex: number): boolean {
    return this.collapsedTasks().has(`${dirIndex}-${taskIndex}`);
  }

  toggleTaskCollapse(dirIndex: number, taskIndex: number): void {
    const key = `${dirIndex}-${taskIndex}`;
    this.collapsedTasks.update(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  readonly dialogStepNumber = computed(() =>
    Math.min(this.store.dialogAnswered() + 1, this.store.dialogTotal())
  );

  dictionaries = computed<Dictionaries>(() => ({
    directions: this.store.directions(),
    tools: this.store.tools(),
    priorities: this.store.priorities(),
  }));

  taskErrors = computed(() => {
    const byDir = new Map<number, Map<number, ValidationError[]>>();
    for (const error of this.store.validationErrors()) {
      const segments = planPathSegments(error.path);
      if (
        segments[0] !== 'plan' ||
        segments[1] !== 'directions' ||
        segments[3] !== 'tasks'
      ) {
        continue;
      }
      const dirIndex = Number(segments[2]);
      const taskIndex = Number(segments[4]);
      if (!Number.isInteger(dirIndex) || !Number.isInteger(taskIndex)) continue;
      let byTask = byDir.get(dirIndex);
      if (!byTask) {
        byTask = new Map<number, ValidationError[]>();
        byDir.set(dirIndex, byTask);
      }
      const list = byTask.get(taskIndex);
      if (list) list.push(error);
      else byTask.set(taskIndex, [error]);
    }
    return byDir;
  });

  mainGoalError = computed<ValidationError | null>(() =>
    this.store.validationErrors().find(error => planPathSegments(error.path).includes('mainGoal')) ?? null
  );

  private readonly isoDeadlineRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

  validationIssues = computed<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];
    const plan = this.store.draft();

    if (!plan.mainGoal?.trim()) {
      issues.push({ fieldId: 'main-goal-input', message: 'Укажите ключевую цель ИПР', kind: 'mainGoal' });
    }

    plan.directions.forEach((direction, i) => {
      if (!direction.goal?.trim()) {
        issues.push({ fieldId: `direction-goal-${i}`, message: 'Укажите направление развития', kind: 'directionGoal' });
      }
      if (!direction.description?.trim()) {
        issues.push({ fieldId: `direction-description-${i}`, message: 'Укажите описание направления', kind: 'directionDescription' });
      }
      if (direction.tasks.length === 0) {
        issues.push({ fieldId: `direction-card-${i}`, message: 'Добавьте хотя бы одно действие', kind: 'noTasks' });
      }
      direction.tasks.forEach((task, t) => {
        if (!task.developmentTool?.trim()) {
          issues.push({ fieldId: `tool-${i}-${t}`, message: 'Укажите инструмент развития', kind: 'taskTool' });
        }
        if (!task.deadLine?.trim() || !this.isoDeadlineRe.test(task.deadLine)) {
          issues.push({ fieldId: `deadline-${i}-${t}`, message: 'Укажите срок выполнения', kind: 'taskDeadline' });
        }
        if (!task.description?.trim()) {
          issues.push({ fieldId: `description-${i}-${t}`, message: 'Укажите описание действия', kind: 'taskDescription' });
        }
      });
    });

    return issues;
  });

  invalidIds = computed(() => new Set(this.validationIssues().map(i => i.fieldId)));

  directionInvalidFields = computed(() => {
    const map = new Map<number, Set<string>>();
    for (const id of this.invalidIds()) {
      const dirMatch = /^direction-(?:goal|description|card)-(\d+)$/.exec(id);
      if (dirMatch) {
        const idx = Number(dirMatch[1]);
        if (!map.has(idx)) map.set(idx, new Set<string>());
        map.get(idx)!.add(id);
        continue;
      }
      const taskMatch = /^(?:tool|deadline|description)-(\d+)-(\d+)$/.exec(id);
      if (taskMatch) {
        const idx = Number(taskMatch[1]);
        if (!map.has(idx)) map.set(idx, new Set<string>());
        map.get(idx)!.add(id);
      }
    }
    return map;
  });

  flashingId = signal<string | null>(null);
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;

  onValidationBannerClick(): void {
    const first = this.validationIssues()[0];
    if (!first) return;
    this.scrollToAndFocus(first.fieldId);
  }

  private scrollToAndFocus(fieldId: string): void {
    const taskMatch = /^(?:tool|deadline|description)-(\d+)-(\d+)$/.exec(fieldId);
    if (taskMatch) {
      const dirIndex = Number(taskMatch[1]);
      const taskIndex = Number(taskMatch[2]);
      const key = `${dirIndex}-${taskIndex}`;
      if (this.collapsedTasks().has(key)) {
        this.collapsedTasks.update(set => {
          const next = new Set(set);
          next.delete(key);
          return next;
        });
      }
    }

    const proceed = () => {
      const el = this.document.getElementById(fieldId);
      if (!el) return;

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      this.flashingId.set(fieldId);
      if (this.flashTimeout !== null) {
        clearTimeout(this.flashTimeout);
      }
      this.flashTimeout = setTimeout(() => this.flashingId.set(null), 600);

      setTimeout(() => {
        this.focusField(el);
      }, 300);
    };

    if (taskMatch) {
      requestAnimationFrame(() => requestAnimationFrame(proceed));
    } else {
      proceed();
    }
  }

  private focusField(el: HTMLElement): void {
    if (el.tagName.toLowerCase() === 'mat-select') {
      this.focusMatSelect(el);
      return;
    }

    const target = this.resolveFocusTarget(el);
    if (!(target instanceof HTMLElement) || !target.isConnected) return;
    this.attemptFocus(target);
  }

  private focusMatSelect(el: HTMLElement): void {
    const select = el as any;
    if (typeof select.focus === 'function') {
      try {
        select.focus({ preventScroll: true });
      } catch {
        select.focus();
      }
    }

    setTimeout(() => {
      const active = this.document.activeElement;
      if (active === el || active?.closest('mat-select') === el) return;

      const trigger = el.querySelector('.mat-mdc-select-trigger') as HTMLElement | null;
      if (!(trigger instanceof HTMLElement)) return;

      if (!trigger.hasAttribute('tabindex')) {
        trigger.setAttribute('tabindex', '-1');
      }
      trigger.focus();
    }, 0);
  }

  private attemptFocus(target: HTMLElement): void {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }

    setTimeout(() => {
      if (this.document.activeElement === target) return;

      const isNativeFocusable = target.matches('input, textarea, select, button, [href]');
      if (!isNativeFocusable && !target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus();
    }, 0);
  }

  private resolveFocusTarget(el: HTMLElement): HTMLElement {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      return el;
    }

    if (el.id.startsWith('direction-card-')) {
      if (el.hasAttribute('tabindex')) return el;
      const nearest = el.querySelector('mat-select, input, textarea, button');
      if (nearest instanceof HTMLElement) return nearest;
      return el;
    }

    const native = el.querySelector('input, textarea') as HTMLElement | null;
    return native ?? el;
  }

  ngOnInit(): void {
    void this.store.ensureDraftLoaded().then(() => {
      if (this.store.directionsCount() === 0 && !this.store.dialogActive()) {
        void this.workflow.startDialog();
      }
    });
  }

  ngAfterViewInit(): void {
    this.mainGoal = this.store.draft().mainGoal;
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    if (this.flashTimeout !== null) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
  }

  // --- Плавающий чат ---

  toggleChat(): void {
    this.chatOpen.update(v => !v);
    if (this.chatOpen()) {
      this.scrollToBottom();
      setTimeout(() => this.chatInputRef?.nativeElement.focus(), 0);
    }
  }

  openChat(): void {
    this.chatOpen.set(true);
    this.scrollToBottom();
    setTimeout(() => this.chatInputRef?.nativeElement.focus(), 0);
  }

  closeChat(): void {
    this.chatOpen.set(false);
  }

  /** Закрытие по клику вне поп-апа (и не по кнопке). */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.chatOpen() || this.store.dialogActive()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (this.chatPopRef?.nativeElement.contains(target)) return;
    if (this.chatFabRef?.nativeElement.contains(target)) return;
    this.chatOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.store.dialogActive()) return;
    this.chatOpen.set(false);
  }

  /** Enter — отправить, Shift+Enter — перенос строки. */
  onChatKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendMessage();
    }
  }

  /** Авто-рост поля ввода под количество строк. */
  autoGrow(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }

  // --- План ---

  onGoalChange(value: string): void {
    this.mainGoal = value;
    this.store.draft.update(plan => ({ ...plan, mainGoal: value }));
  }

  onTaskUpdate(event: { dirIndex: number; taskIndex: number; partial: Partial<IdpTask> }): void {
    this.store.updateTask(event.dirIndex, event.taskIndex, event.partial);
  }

  onTaskDelete(event: { dirIndex: number; taskIndex: number }): void {
    this.store.removeTask(event.dirIndex, event.taskIndex);
  }

  onDirectionUpdate(event: { dirIndex: number; partial: Partial<IdpPlan['directions'][0]> }): void {
    this.store.updateDirection(event.dirIndex, event.partial);
  }

  onDirectionDelete(index: number): void {
    this.store.removeDirection(index);
  }

  onDirectionReorder(event: CdkDragDrop<IdpDirection[]>): void {
    this.store.moveDirection(event.previousIndex, event.currentIndex);
  }

  onAddTask(dirIndex: number): void {
    const newTask = {
      developmentTool: '',
      comment: '',
      deadLine: '',
      description: '',
    };
    this.store.addTask(dirIndex, newTask);
  }

  addDirection(): void {
    const rank = this.store.priorities()[0]?.rank ?? 1;
    const newDirection = {
      rank: rank as 0 | 1 | 2,
      goal: '',
      description: '',
      tasks: [{
        developmentTool: '',
        comment: '',
        deadLine: '',
        description: '',
      }],
    };
    this.store.addDirection(newDirection);
  }

  async sendMessage(): Promise<void> {
    if (!this.messageText.trim() || this.store.isStreaming()) return;

    const text = this.messageText;
    this.messageText = '';
    if (this.chatInputRef?.nativeElement) {
      this.chatInputRef.nativeElement.style.height = 'auto';
    }

    if (this.store.dialogActive()) {
      await this.workflow.sendDialogMessage(text);
    } else {
      await this.workflow.refineDraft(text);
    }
    this.scrollToBottom();
  }

  sendSuggestion(text: string): void {
    if (this.store.isStreaming()) return;
    this.messageText = text;
    void this.sendMessage();
  }

  goBack(): void {
    this.router.navigate(['/idp/assessment']);
  }

  goToCompletion(): void {
    this.router.navigate(['/idp/completion']);
  }

  async confirmPlan(): Promise<void> {
    if (this.confirming()) return;

    // Модалка «Подтвердите правильность данных» перед отправкой.
    const plan = this.store.draft();
    const tasksCount = plan.directions.reduce((sum, d) => sum + d.tasks.length, 0);
    const ref = this.dialog.open(ConfirmPlanDialogComponent, {
      data: { mainGoal: plan.mainGoal, directionsCount: plan.directions.length, tasksCount },
      width: '520px',
      maxWidth: '92vw',
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;

    this.confirming.set(true);
    let returnUrl: string | null = null;
    let exported = false;
    try {
      // Экспорт без авто-редиректа: сначала покажем окно подтверждения.
      returnUrl = await this.workflow.exportPlan({ autoRedirect: false });
      exported = true;
    } catch {
      // 422: ошибки валидации сохранены стором и показаны в баннере.
    } finally {
      this.confirming.set(false);
    }

    if (!exported) return;

    // Окно «ИПР экспортирован в «План развития»»: переход — только по кнопке.
    const goToPlan = await firstValueFrom(
      this.dialog.open(ExportSuccessDialogComponent, {
        data: { hasReturnUrl: !!returnUrl },
        width: '480px',
        maxWidth: '92vw',
        disableClose: true,
      }).afterClosed(),
    );
    if (goToPlan && returnUrl) {
      window.location.href = returnUrl;
    }
  }

  async savePlan(): Promise<void> {
    if (this.saving() || this.store.directionsCount() === 0) return;
    this.saving.set(true);
    try {
      await this.store.updateDraftPlan({ ...this.store.draft() });
      this.snackBar.open('Изменения сохранены', '', { duration: 2500 });
    } catch {
      this.snackBar.open('Не удалось сохранить изменения', 'Закрыть', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  onStageNavigate(stage: WorkflowStage): void {
    if (!this.workflow.canActivateStage(stage)) return;
    if (stage === 'STAGE_2_QUESTIONNAIRE') {
      this.goBack();
    } else if (stage === 'STAGE_5_COMPLETED') {
      this.goToCompletion();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatContainer?.nativeElement) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }
}
