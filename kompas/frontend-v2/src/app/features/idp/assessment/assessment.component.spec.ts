import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { AssessmentComponent } from './assessment.component';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { ChatMessage, IdpDirection, SkillAssessmentItem, StageLabel, WorkflowStage } from '../../../models/idp.models';

/**
 * T-A1: layout stability on /idp/assessment. The chat card must live next to
 * the questionnaire (never replace it) and streaming must only disable actions
 * and show a spinner inside the pressed button.
 */
describe('AssessmentComponent', () => {
  let fixture: ComponentFixture<AssessmentComponent>;
  let component: AssessmentComponent;
  let fakeStore: ReturnType<typeof createFakeStore>;
  let fakeWorkflow: {
    initializeAssessment: ReturnType<typeof vi.fn>;
    generateDraft: ReturnType<typeof vi.fn>;
    canActivateStage: ReturnType<typeof vi.fn>;
  };
  let navigateFn: ReturnType<typeof vi.fn>;

  const RATED_SKILLS: SkillAssessmentItem[] = [
    { skillId: 's1', skillName: 'TypeScript', description: '', rating: 4 },
    { skillId: 's2', skillName: 'Angular', description: '', rating: 4 },
  ];

  function createFakeStore() {
    const skills = signal<SkillAssessmentItem[]>([]);
    const ratings = signal(new Map<string, number>());
    const plannedTasks = signal('');
    const messages = signal<ChatMessage[]>([]);
    const isStreaming = signal(false);
    const directions = signal<IdpDirection[]>([]);
    return {
      skills,
      ratings,
      plannedTasks,
      messages,
      isStreaming,
      directions,
      currentStreamingMessageId: signal<string | null>(null),
      currentStage: signal<WorkflowStage>('STAGE_2_QUESTIONNAIRE'),
      stageLabels: signal<StageLabel[]>([]),
      allSkillsRated: computed(() => skills().length > 0 && skills().every(s => s.rating !== null)),
      directionsCount: computed(() => directions().length),
      getRating: (skillId: string) => ratings().get(skillId),
      updateRating: vi.fn(),
    };
  }

  function card(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  }

  /** Buttons of the questionnaire action bar, in template order: back, dialog, generate. */
  function questionnaireButtons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.assess-foot button')
    ) as HTMLButtonElement[];
  }

  beforeEach(async () => {
    fakeStore = createFakeStore();
    fakeWorkflow = {
      initializeAssessment: vi.fn(async () => undefined),
      generateDraft: vi.fn(async () => undefined),
      canActivateStage: vi.fn(() => true),
    };
    navigateFn = vi.fn(async () => true);

    await TestBed.configureTestingModule({
      imports: [AssessmentComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: IdpStoreService, useValue: fakeStore },
        { provide: IdpWorkflowService, useValue: fakeWorkflow },
        { provide: Router, useValue: { navigate: navigateFn } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(AssessmentComponent, {
        set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AssessmentComponent);
    component = fixture.componentInstance;
  });

  it('keeps the questionnaire mounted for the whole stream and shows the chat card independently', () => {
    fakeStore.skills.set(RATED_SKILLS);
    fixture.detectChanges();

    expect(card('.questionnaire-card')).not.toBeNull();
    expect(card('.chat-card')).toBeNull();

    // Stream starts (e.g. generate): chat appears, questionnaire STAYS.
    fakeStore.isStreaming.set(true);
    fixture.detectChanges();
    expect(card('.questionnaire-card')).not.toBeNull();
    expect(card('.chat-card')).not.toBeNull();

    // Stream stops: chat stays because the conversation exists.
    fakeStore.isStreaming.set(false);
    fakeStore.messages.set([
      { id: 'm1', role: 'assistant', content: 'Готово', createdAt: '2026-10-24T10:00:00Z' },
    ]);
    fixture.detectChanges();
    expect(card('.questionnaire-card')).not.toBeNull();
    expect(card('.chat-card')).not.toBeNull();

    // The messages list is still rendered.
    expect(fixture.nativeElement.querySelectorAll('app-chat-message').length).toBe(1);
  });

  it('disables the questionnaire actions while streaming without unmounting the card', () => {
    fakeStore.skills.set(RATED_SKILLS);
    fixture.detectChanges();

    fakeStore.isStreaming.set(true);
    fixture.detectChanges();

    const buttons = questionnaireButtons();
    expect(buttons.length).toBe(3);
    expect(buttons.every(button => button.disabled)).toBe(true);
    expect(card('.questionnaire-card')).not.toBeNull();
  });

  it('shows the spinner only inside the button that was pressed', async () => {
    fakeStore.skills.set(RATED_SKILLS);
    fixture.detectChanges();

    const generateButton = questionnaireButtons()[2];

    // A foreign stream (auto-init) alone must not put a spinner in generate.
    fakeStore.isStreaming.set(true);
    fixture.detectChanges();
    expect(generateButton.querySelector('mat-spinner')).toBeNull();

    fakeStore.isStreaming.set(false);
    fixture.detectChanges();

    let resolveGenerate!: () => void;
    fakeWorkflow.generateDraft.mockImplementation(
      () => new Promise<void>(resolve => { resolveGenerate = resolve; })
    );

    const pending = component.generateDraft();
    fixture.detectChanges();

    const buttons = questionnaireButtons();
    const pressedButton = buttons[buttons.length - 1];
    expect(pressedButton.querySelector('mat-spinner')).not.toBeNull();
    expect(card('.questionnaire-card')).not.toBeNull();
    expect(card('.init-card')).toBeNull();

    // Let generateDraft() get past its internal awaits and call the workflow.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(resolveGenerate).toBeTypeOf('function');

    resolveGenerate();
    await pending;    fixture.detectChanges();

    expect(questionnaireButtons()[2].querySelector('mat-spinner')).toBeNull();
  });

  it('waits for the auto-init stream to settle before generating (no double stream)', async () => {
    fakeStore.skills.set(RATED_SKILLS);
    fakeStore.isStreaming.set(true);
    fixture.detectChanges();

    const streamingAtStart: boolean[] = [];
    fakeWorkflow.generateDraft.mockImplementation(async () => {
      streamingAtStart.push(fakeStore.isStreaming());
    });

    // The init stream finishes shortly after the click.
    setTimeout(() => fakeStore.isStreaming.set(false), 60);

    await component.generateDraft();

    expect(streamingAtStart).toEqual([false]);
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it('navigates to the draft only when the backend produced directions', async () => {
    fakeStore.skills.set(RATED_SKILLS);
    fakeStore.directions.set([
      { rank: 0, goal: 'Goal', description: '', tasks: [] },
    ] as IdpDirection[]);
    fixture.detectChanges();

    await component.generateDraft();

    expect(fakeWorkflow.generateDraft).toHaveBeenCalledOnce();
    expect(navigateFn).toHaveBeenCalledWith(['/idp/draft']);
  });
});
