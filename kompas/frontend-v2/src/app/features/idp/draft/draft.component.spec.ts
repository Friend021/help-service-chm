import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signal, computed } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { DraftComponent } from './draft.component';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { IdpPlan, IdpTask, ValidationError } from '../../../models/idp.models';

/**
 * D-4/B1 focused unit tests for draft editing wiring and hydration.
 * The store is replaced by a fake so we can observe signal writes and method
 * calls without real HTTP; child components are ignored via NO_ERRORS_SCHEMA.
 */

describe('DraftComponent', () => {
  let fixture: ComponentFixture<DraftComponent>;
  let component: DraftComponent;
  let fakeStore: ReturnType<typeof createFakeStore>;

  function createFakeStore() {
    const draft = signal<IdpPlan>({ mainGoal: 'Initial goal', directions: [] });
    return {
      draft,
      validationErrors: signal<ValidationError[]>([]),
      draftResponse: signal(null),
      directionsCount: computed(() => draft().directions.length),
      messages: signal([]),
      currentStreamingMessageId: signal<string | null>(null),
      isStreaming: signal(false),
      dialogActive: signal(false),
      dialogStep: signal('goal'),
      dialogAnswered: signal(0),
      dialogTotal: signal(5),
      dialogSuggestions: signal<string[]>([]),
      currentStage: signal('STAGE_4_REFINEMENT'),
      stageLabels: signal([]),
      directions: signal([]),
      tools: signal([]),
      priorities: signal([]),
      ensureDraftLoaded: vi.fn(async () => undefined),
      updateTask: vi.fn(),
      removeTask: vi.fn(),
      updateDirection: vi.fn(),
      removeDirection: vi.fn(),
      addTask: vi.fn(),
      addDirection: vi.fn(),
      moveDirection: vi.fn(),
      updateDraftPlan: vi.fn(async (_plan: IdpPlan) => ({})),
    };
  }

  beforeEach(async () => {
    fakeStore = createFakeStore();
    localStorage.removeItem('idp-chat-width');

    await TestBed.configureTestingModule({
      imports: [DraftComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: IdpStoreService, useValue: fakeStore },
        { provide: IdpWorkflowService, useValue: { canActivateStage: () => true, startDialog: vi.fn(async () => undefined), sendDialogMessage: vi.fn(async () => undefined), refineDraft: vi.fn(async () => undefined), confirmPlan: vi.fn(async () => undefined) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(DraftComponent, {
        set: { imports: [CommonModule, FormsModule], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DraftComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates via ensureDraftLoaded on init (D-3r #3)', () => {
    fixture.detectChanges();
    expect(fakeStore.ensureDraftLoaded).toHaveBeenCalledOnce();
  });

  it('syncs mainGoal into the store draft on change without autosaving (explicit-save semantics)', () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    component.onGoalChange('Updated goal');

    expect(component.mainGoal).toBe('Updated goal');
    expect(fakeStore.draft().mainGoal).toBe('Updated goal');
    expect(fakeStore.updateDraftPlan).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(fakeStore.updateDraftPlan).not.toHaveBeenCalled();
  });

  it('does not autosave on repeated mainGoal changes', () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    component.onGoalChange('First');
    vi.advanceTimersByTime(300);
    component.onGoalChange('Second');
    vi.advanceTimersByTime(500);

    expect(fakeStore.updateDraftPlan).not.toHaveBeenCalled();
  });

  it('wires taskUpdate to store.updateTask without autosaving (D-3r #1)', () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    const partial: Partial<IdpTask> = { description: 'Edited task' };
    component.onTaskUpdate({ dirIndex: 1, taskIndex: 2, partial });

    expect(fakeStore.updateTask).toHaveBeenCalledWith(1, 2, partial);

    vi.advanceTimersByTime(500);
    expect(fakeStore.updateDraftPlan).not.toHaveBeenCalled();
  });

  it('wires taskDelete to store.removeTask without autosaving (D-3r #1)', () => {
    vi.useFakeTimers();
    fixture.detectChanges();

    component.onTaskDelete({ dirIndex: 0, taskIndex: 1 });

    expect(fakeStore.removeTask).toHaveBeenCalledWith(0, 1);

    vi.advanceTimersByTime(500);
    expect(fakeStore.updateDraftPlan).not.toHaveBeenCalled();
  });

  it('keeps the validation banner and maps task errors by direction/task index (D-3r #8)', () => {
    fakeStore.validationErrors.set([
      { path: 'plan.directions.1.tasks.2.deadLine', message: 'Срок в прошлом' },
      { path: 'plan.directions.0.tasks.0.comment', message: 'Комментарий слишком длинный' },
    ]);
    fixture.detectChanges();

    const byDir = component.taskErrors();
    expect(byDir.get(1)?.get(2)).toEqual([{ path: 'plan.directions.1.tasks.2.deadLine', message: 'Срок в прошлом' }]);
    expect(byDir.get(0)?.get(0)).toEqual([{ path: 'plan.directions.0.tasks.0.comment', message: 'Комментарий слишком длинный' }]);
    expect(component.mainGoalError()).toBeNull();
  });

});
