import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api.service';
import { Idp, Priority, PriorityPatch } from '../core/models';

interface EditableAction {
  instrument: string;
  activityCode: string | null;
  activityName: string | null;
  action: string;
  dueDate: string | null;
  status: string;
}

interface EditablePriority {
  order: number;
  goalCategory: string | null;
  developmentGoal: string;
  competencyCodes: string[];
  competencyNames: string[];
  actions: EditableAction[];
}

@Component({
  selector: 'app-idp-panel',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './idp-panel.component.html',
  styleUrls: ['./idp-panel.component.css']
})
export class IdpPanelComponent {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly draft = signal<EditablePriority[]>([]);

  private current: Idp | null = null;

  @Input()
  set idp(value: Idp | null | undefined) {
    this.current = value ?? null;
    if (!this.editing()) {
      this.draft.set(this.toEditable(this.current));
    }
  }

  get idp(): Idp | null {
    return this.current;
  }

  @Output() readonly changed = new EventEmitter<Idp>();

  /** Просьба набить план болванкой: сессией владеет чат, он и вызывает API. */
  @Output() readonly demoRequested = new EventEmitter<void>();

  generateDemo(): void {
    this.demoRequested.emit();
  }

  get readOnly(): boolean {
    return this.current?.status !== 'DRAFT';
  }

  get empty(): boolean {
    return !this.current || this.current.priorities.length === 0;
  }

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'DRAFT':
        return 'Черновик';
      case 'ON_APPROVAL':
        return 'На согласовании';
      case 'APPROVED':
        return 'Согласован';
      case 'REJECTED':
        return 'Отклонён';
      default:
        return status ?? '';
    }
  }

  startEdit(): void {
    this.draft.set(this.toEditable(this.current));
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.draft.set(this.toEditable(this.current));
  }

  removePriority(index: number): void {
    this.draft.update((items) => items.filter((_, i) => i !== index));
  }

  removeCompetency(priorityIndex: number, code: string): void {
    this.draft.update((items) =>
      items.map((item, i) => {
        if (i !== priorityIndex) {
          return item;
        }
        const position = item.competencyCodes.indexOf(code);
        if (position < 0) {
          return item;
        }
        return {
          ...item,
          competencyCodes: item.competencyCodes.filter((_, index) => index !== position),
          competencyNames: item.competencyNames.filter((_, index) => index !== position)
        };
      })
    );
  }

  removeAction(priorityIndex: number, actionIndex: number): void {
    this.draft.update((items) =>
      items.map((item, i) =>
        i === priorityIndex
          ? { ...item, actions: item.actions.filter((_, index) => index !== actionIndex) }
          : item
      )
    );
  }

  /** Три значения выпадающего списка «Инструмент развития» формы. */
  readonly instruments = [
    'Развитие на рабочем месте',
    'Развитие через других',
    'Развитие через учебные программы'
  ];

  save(): void {
    if (!this.current) {
      return;
    }
    const payload: PriorityPatch[] = this.draft()
      .filter((item) => item.developmentGoal.trim().length > 0)
      .map((item, index) => ({
        order: index + 1,
        goalCategory: item.goalCategory,
        developmentGoal: item.developmentGoal.trim(),
        competencyCodes: item.competencyCodes,
        actions: item.actions
          .filter((action) => action.action.trim().length > 0)
          .map((action) => ({
            instrument: action.instrument,
            activityCode: action.activityCode,
            action: action.action.trim(),
            dueDate: action.dueDate
          }))
      }));

    this.busy.set(true);
    this.api.updateIdp(this.current.id, payload).subscribe({
      next: (idp) => {
        this.busy.set(false);
        this.editing.set(false);
        this.current = idp;
        this.draft.set(this.toEditable(idp));
        this.changed.emit(idp);
        this.snackBar.open('Черновик сохранён', 'Ок', { duration: 2500 });
      },
      error: (response) => {
        this.busy.set(false);
        this.snackBar.open(this.errorText(response), 'Ок', { duration: 5000 });
      }
    });
  }

  submit(): void {
    if (!this.current) {
      return;
    }
    this.busy.set(true);
    this.api.submitIdp(this.current.id).subscribe({
      next: (idp) => {
        this.busy.set(false);
        this.current = idp;
        this.draft.set(this.toEditable(idp));
        this.changed.emit(idp);
        this.snackBar.open('ИПР направлен руководителю на согласование', 'Ок', { duration: 4000 });
      },
      error: (response) => {
        this.busy.set(false);
        this.snackBar.open(this.errorText(response), 'Ок', { duration: 5000 });
      }
    });
  }

  /** Перенос плана обратно в «ПЛАН РАЗВИТИЯ»: уходим по подписанной ссылке. */
  toLegacy(): void {
    if (!this.current) {
      return;
    }
    this.busy.set(true);
    this.api.handoverIdp(this.current.id).subscribe({
      next: (response) => {
        this.busy.set(false);
        window.location.href = response.url;
      },
      error: (response) => {
        this.busy.set(false);
        this.snackBar.open(this.errorText(response), 'Ок', { duration: 5000 });
      }
    });
  }

  download(format: 'docx' | 'json'): void {
    if (!this.current) {
      return;
    }
    this.busy.set(true);
    this.api.exportIdp(this.current.id, format).subscribe({
      next: (response) => {
        this.busy.set(false);
        const blob = response.body;
        if (!blob) {
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `IPR_${this.current?.id}.${format}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.busy.set(false);
        this.snackBar.open('Не удалось выгрузить файл', 'Ок', { duration: 4000 });
      }
    });
  }

  private toEditable(idp: Idp | null): EditablePriority[] {
    if (!idp) {
      return [];
    }
    return idp.priorities.map((priority: Priority) => ({
      order: priority.order,
      goalCategory: priority.goalCategory ?? null,
      developmentGoal: priority.developmentGoal,
      competencyCodes: priority.competencies.map((item) => item.code),
      competencyNames: priority.competencies.map((item) => item.name),
      actions: priority.actions.map((item) => ({
        instrument: item.instrument,
        activityCode: item.activityCode ?? null,
        activityName: item.activityName ?? null,
        action: item.action,
        dueDate: item.dueDate ?? null,
        status: item.status
      }))
    }));
  }

  private errorText(response: unknown): string {
    const payload = response as { error?: { error?: string } };
    return payload?.error?.error ?? 'Операция не выполнена';
  }
}
