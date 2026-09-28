import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api.service';
import { ChatMessage, EmployeeInfo, Idp, Stage, TurnResponse } from '../core/models';
import { IdpPanelComponent } from '../idp/idp-panel.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    IdpPanelComponent
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly stage = signal<Stage | null>(null);
  readonly employee = signal<EmployeeInfo | null>(null);
  readonly idp = signal<Idp | null>(null);

  sessionId = 0;
  text = '';

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('sessionId');
    this.sessionId = Number(raw);
    if (!this.sessionId) {
      void this.router.navigate(['/entry']);
      return;
    }

    this.api.getSession(this.sessionId).subscribe({
      next: (session) => {
        this.loading.set(false);
        this.messages.set(session.messages);
        this.stage.set(session.stage);
        this.employee.set(session.employee);
        this.idp.set(session.idp ?? null);
        this.scrollDown();
      },
      error: (response) => {
        this.loading.set(false);
        if (response?.status === 401 || response?.status === 403) {
          void this.router.navigate(['/entry']);
          return;
        }
        this.snackBar.open('Не удалось загрузить сессию', 'Ок', { duration: 5000 });
      }
    });
  }

  send(): void {
    const text = this.text.trim();
    if (!text || this.sending()) {
      return;
    }

    this.messages.update((items) => [
      ...items,
      { id: -Date.now(), role: 'user', content: text, createdAt: new Date().toISOString() }
    ]);
    this.text = '';
    this.sending.set(true);
    this.scrollDown();

    this.api.sendMessage(this.sessionId, text).subscribe({
      next: (turn) => {
        this.sending.set(false);
        this.applyTurn(turn);
      },
      error: (response) => {
        this.sending.set(false);
        const message = response?.error?.error ?? 'Ассистент не ответил. Повторите попытку.';
        this.snackBar.open(message, 'Ок', { duration: 6000 });
      }
    });
  }

  /** Общее для обычного хода и тестового плана: реплика, стадия, роль, панель. */
  private applyTurn(turn: TurnResponse): void {
    this.messages.update((items) => [
      ...items,
      {
        id: -Date.now(),
        role: 'assistant',
        content: turn.assistantMessage,
        createdAt: new Date().toISOString()
      }
    ]);
    this.stage.set(turn.stage);
    // Целевая роль могла смениться в диалоге — обновляем шапку.
    if (turn.targetRole) {
      this.employee.update((person) =>
        person && person.targetRole !== turn.targetRole
          ? { ...person, targetRole: turn.targetRole }
          : person
      );
    }
    if (turn.idp) {
      this.idp.set(turn.idp);
    }
    this.scrollDown();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  onIdpChanged(idp: Idp): void {
    this.idp.set(idp);
  }

  /** Тестовый план: тот же ход диалога, только без обращения к модели. */
  onDemoRequested(): void {
    if (this.sending()) {
      return;
    }
    this.sending.set(true);
    this.api.demoDraft(this.sessionId).subscribe({
      next: (turn) => {
        this.sending.set(false);
        this.applyTurn(turn);
      },
      error: (response) => {
        this.sending.set(false);
        this.snackBar.open(
          response?.error?.error ?? 'Не удалось собрать тестовый план', 'Ок', { duration: 6000 });
      }
    });
  }

  get progress(): number {
    const stage = this.stage();
    return stage ? (stage.index / stage.total) * 100 : 0;
  }

  private scrollDown(): void {
    setTimeout(() => {
      const element = this.scroller?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
