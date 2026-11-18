import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TaskEditorComponent } from './task-editor.component';
import { Dictionaries, IdpTask, ValidationError } from '../../../models/idp.models';

/**
 * Focused spec for the D-3r #8 fix: 422 ValidationError paths from
 * mock-backend ({path, message}) must be mapped to the matching task field
 * (highlight + inline message). Rendering is kept to Mat form fields; errors
 * arrive pre-scoped to this task via the `errors` input.
 */

const TASK: IdpTask = {
  developmentTool: 'Развитие через рабочие курсы',
  comment: 'комментарий',
  deadLine: '2026-06-15T00:00:00.000Z',
  description: 'описание',
};

const DICTIONARIES_STUB: Dictionaries = {
  directions: ['Адаптация к должности'],
  tools: ['Развитие на рабочем месте'],
  priorities: [{ rank: 1, label: 'Высокий' }],
};

describe('TaskEditorComponent (422 field mapping)', () => {
  let fixture: ComponentFixture<TaskEditorComponent>;
  let component: TaskEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TaskEditorComponent] }).compileComponents();
    fixture = TestBed.createComponent(TaskEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('task', TASK);
    fixture.componentRef.setInput('dirIndex', 0);
    fixture.componentRef.setInput('taskIndex', 1);
    fixture.componentRef.setInput('dictionaries', DICTIONARIES_STUB);
  });

  it('maps a dotted 422 path to the matching field and renders the message (one case)', () => {
    fixture.componentRef.setInput('errors', [
      { path: 'plan.directions.0.tasks.1.deadLine', message: 'Срок не может быть в прошлом' },
      { path: 'plan.mainGoal', message: 'Пустая цель' },
    ] satisfies ValidationError[]);
    fixture.detectChanges();

    expect(component.fieldError('deadLine')?.message).toBe('Срок не может быть в прошлом');
    expect(component.fieldError('comment')).toBeUndefined();
    expect(component.fieldError('description')).toBeUndefined();

    // Highlight class on the field + inline message rendered once.
    const fields = fixture.debugElement.queryAll(By.css('mat-form-field'));
    expect(fields.filter(f => f.classes['field-invalid']).length).toBe(1);
    const texts = fixture.nativeElement.textContent as string;
    expect(texts).toContain('Срок не может быть в прошлом');
    expect(texts).not.toContain('Пустая цель'); // mainGoal error stays at draft level
  });

  it('also matches the bracket path notation used in some 422 payloads', () => {
    fixture.componentRef.setInput('errors', [
      { path: 'plan.directions[0].tasks[1].comment', message: 'Комментарий слишком длинный' },
    ] satisfies ValidationError[]);

    expect(component.fieldError('comment')?.message).toBe('Комментарий слишком длинный');
    expect(component.fieldError('deadLine')).toBeUndefined();
  });
});
