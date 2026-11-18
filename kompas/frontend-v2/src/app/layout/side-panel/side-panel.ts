import { Component, input, contentChild, signal, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * Правая панель страницы — дополнительный контент справа от основного.
 * Поддерживает как простой контент, так и template через side-panel slot.
 *
 * Сворачивание: десктоп ≥1024px — узкий рельс; ≤1024px — нижний drawer
 * с затемняющим фоном (закрытие по фону или кнопке).
 */
@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './side-panel.html',
  styleUrl: './side-panel.scss',
  host: {
    '[class.is-collapsed]': 'collapsed()',
  },
})
export class SidePanel {
  /** Необязательный заголовок панели. */
  readonly title = input<string>();

  /** Template для расширенного контента (используется в idp-shell) */
  readonly sidePanelContent = contentChild<TemplateRef<unknown>>('sidePanel');

  /** Состояние сворачивания (CSS сам решает: рельс или drawer). */
  readonly collapsed = signal(false);

  toggle(): void {
    this.collapsed.update(collapsed => !collapsed);
  }
}
