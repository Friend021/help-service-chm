import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ChatMessage, ChatRole } from '../../../models/idp.models';

@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div
      class="chat-message"
      [class.user]="message().role === 'user'"
      [class.assistant]="message().role === 'assistant'"
      role="article"
      [attr.aria-label]="message().role === 'assistant' ? 'Сообщение AI Ассистента' : 'Ваше сообщение'"
    >
      <div class="message-avatar" aria-hidden="true">
        @if (message().role === 'assistant') {
          <mat-icon>smart_toy</mat-icon>
        } @else {
          <mat-icon>person</mat-icon>
        }
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-role">{{ message().role === 'assistant' ? 'AI Ассистент' : 'Вы' }}</span>
          <time class="message-time" [attr.datetime]="message().createdAt">{{ formattedTime() }}</time>
        </div>
        <div class="message-text" [class.streaming]="isStreaming()">
          {{ message().content }}
          @if (isStreaming()) {
            <span class="cursor" aria-hidden="true">|</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chat-message {
      display: flex;
      gap: 12px;
      margin-bottom: 0;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .chat-message.user {
      flex-direction: row-reverse;
    }

    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 20px;
    }

    .chat-message.assistant .message-avatar {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .chat-message.user .message-avatar {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .message-content {
      flex: 1;
      max-width: 80%;
    }

    .chat-message.user .message-content {
      text-align: right;
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 0.75rem;
    }

    .message-role {
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
    }

    .message-time {
      color: var(--mat-sys-on-surface-variant);
      opacity: 1;
    }

    .message-text {
      padding: 12px 16px;
      border-radius: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-shadow: var(--shadow-1);
    }

    .chat-message.assistant .message-text {
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      border-bottom-left-radius: 4px;
    }

    .chat-message.user .message-text {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      border-bottom-right-radius: 4px;
    }

    .message-text.streaming {
      min-height: 1.5em;
    }

    .cursor {
      display: inline-block;
      animation: blink 1s infinite;
      color: var(--mat-sys-primary);
    }

    .chat-message.user .cursor {
      color: var(--mat-sys-on-primary);
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    // Стриминг: мягкая пульсация роста текста + «появление»
    .message-text.streaming {
      min-height: 1.5em;
      animation: streamGlow 1.6s ease-in-out infinite;
    }

    .chat-message.user .message-text.streaming {
      animation-name: streamGlowUser;
    }

    @keyframes streamGlow {
      0%, 100% { box-shadow: 0 0 0 2px var(--mat-sys-primary-container); }
      50% { box-shadow: 0 0 0 4px var(--mat-sys-primary-container); }
    }

    @keyframes streamGlowUser {
      0%, 100% { box-shadow: 0 0 0 2px var(--mat-sys-secondary-container); }
      50% { box-shadow: 0 0 0 4px var(--mat-sys-secondary-container); }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-message {
        animation: none;
      }

      .message-text.streaming {
        animation: none;
      }

      .cursor {
        animation: none;
      }
    }
  `],
})
export class ChatMessageComponent {
  message = input.required<ChatMessage>();
  isStreaming = input(false);

  formattedTime = computed(() => {
    const date = new Date(this.message().createdAt);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  });
}