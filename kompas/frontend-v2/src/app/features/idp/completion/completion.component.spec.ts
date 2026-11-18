import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { signal, computed } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { CompletionComponent } from './completion.component';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { IdpPlan, ValidationError } from '../../../models/idp.models';

/**
 * D-4/B1 focused test: completion init must hydrate the draft so a hard
 * reload at stage 5 does not render an empty plan (D-3r #3).
 */

describe('CompletionComponent', () => {
  let fixture: ComponentFixture<CompletionComponent>;
  let fakeStore: ReturnType<typeof createFakeStore>;

  function createFakeStore() {
    const draft = signal<IdpPlan>({ mainGoal: 'Done', directions: [] });
    return {
      draft,
      validationErrors: signal<ValidationError[]>([]),
      draftResponse: signal(null),
      directionsCount: computed(() => draft().directions.length),
      currentStage: signal('STAGE_5_COMPLETED'),
      stageLabels: signal([]),
      directions: signal([]),
      tools: signal([]),
      priorities: signal([]),
      ensureDraftLoaded: vi.fn(async () => undefined),
    };
  }

  beforeEach(async () => {
    fakeStore = createFakeStore();

    await TestBed.configureTestingModule({
      imports: [CompletionComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: IdpStoreService, useValue: fakeStore },
        { provide: IdpWorkflowService, useValue: { canActivateStage: () => true } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn(() => ({ afterClosed: () => ({ subscribe: vi.fn() }) })) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(CompletionComponent, {
        set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CompletionComponent);
  });

  it('hydrates via ensureDraftLoaded on init (D-3r #3)', () => {
    fixture.detectChanges();
    expect(fakeStore.ensureDraftLoaded).toHaveBeenCalledOnce();
  });
});
