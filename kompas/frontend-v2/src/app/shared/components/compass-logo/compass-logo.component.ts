import { Component, input } from '@angular/core';

/**
 * Логотип «Компас»: циферблат с иглой.
 * Наследует цвет текста (currentColor), игла — акцентным цветом ДС.
 */
@Component({
  selector: 'app-compass-logo',
  standalone: true,
  template: `
    <svg
      class="compass"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Компас"
      focusable="false"
    >
      <circle cx="16" cy="16" r="13.4" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
      <g stroke="currentColor" stroke-width="1.2" opacity="0.45">
        <line x1="16" y1="2.4" x2="16" y2="5.2" />
        <line x1="16" y1="26.8" x2="16" y2="29.6" />
        <line x1="2.4" y1="16" x2="5.2" y2="16" />
        <line x1="26.8" y1="16" x2="29.6" y2="16" />
      </g>
      <polygon points="16,6.6 20.2,16 16,14.4 11.8,16" fill="var(--primary-300, #6faff7)" />
      <polygon points="16,25.4 11.8,16 16,17.6 20.2,16" fill="currentColor" opacity="0.32" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      line-height: 0;
    }

    .compass {
      display: block;
    }
  `],
})
export class CompassLogoComponent {
  readonly size = input(20);
}
