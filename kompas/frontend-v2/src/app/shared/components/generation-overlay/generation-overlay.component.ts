import { Component, signal, inject, DestroyRef, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Полноэкранный лоадер генерации черновика ИПР: пока ассистент думает (~15–30с),
 * показывает бегущие фразы процесса — профессионально, с лёгкой улыбкой.
 */
@Component({
  selector: 'app-generation-overlay',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="gen-overlay" role="status" aria-live="polite">
      <div class="gen-box">
        <div class="gen-dial">
          <span class="gen-ring"></span>
          <mat-icon class="gen-compass">explore</mat-icon>
        </div>

        <div class="gen-phrase-wrap">
          @for (p of [phrase()]; track p) {
            <p class="gen-phrase">{{ p }}</p>
          }
        </div>

        <div class="gen-bar"><span class="gen-bar__fill"></span></div>
        <p class="gen-sub">{{ subtitle() }}</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .gen-overlay {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(1200px 600px at 50% 30%, rgba(31, 168, 130, 0.14), transparent 60%),
                  rgba(18, 22, 28, 0.82);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      animation: gen-fade-in .25s ease both;
    }

    .gen-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      max-width: 520px;
      width: 100%;
    }

    /* Циферблат-компас: вращающееся кольцо + статичная стрелка. */
    .gen-dial { position: relative; width: 92px; height: 92px; margin-bottom: 26px; }
    .gen-ring {
      position: absolute; inset: 0;
      border-radius: 50%;
      border: 4px solid rgba(255, 255, 255, 0.12);
      border-top-color: #25c79b;
      border-right-color: #25c79b;
      animation: gen-spin 1s linear infinite;
    }
    .gen-compass {
      position: absolute; inset: 0; margin: auto;
      width: 44px; height: 44px; font-size: 44px;
      color: #35d3a6;
      display: grid; place-items: center;
      animation: gen-wobble 3.2s ease-in-out infinite;
    }

    .gen-phrase-wrap { min-height: 34px; display: grid; place-items: center; }
    .gen-phrase {
      margin: 0;
      font: 600 21px/1.35 var(--font-medium, inherit);
      color: #fff;
      letter-spacing: -.01em;
      animation: gen-phrase-in .5s cubic-bezier(.22,.61,.36,1) both;
    }

    .gen-bar {
      margin: 22px 0 14px;
      width: 220px; max-width: 70vw; height: 4px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.12);
      overflow: hidden;
    }
    .gen-bar__fill {
      display: block; height: 100%; width: 40%;
      border-radius: 4px;
      background: linear-gradient(90deg, transparent, #25c79b, transparent);
      animation: gen-slide 1.4s ease-in-out infinite;
    }

    .gen-sub { margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.55); }

    @keyframes gen-spin { to { transform: rotate(360deg); } }
    @keyframes gen-wobble { 0%,100% { transform: rotate(-9deg); } 50% { transform: rotate(9deg); } }
    @keyframes gen-slide { 0% { transform: translateX(-120%); } 100% { transform: translateX(370%); } }
    @keyframes gen-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes gen-phrase-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .gen-ring, .gen-compass, .gen-bar__fill, .gen-phrase, .gen-overlay { animation-duration: .01ms; animation-iteration-count: 1; }
    }
  `],
})
export class GenerationOverlayComponent {
  /** Подзаголовок под прогрессом. */
  readonly subtitle = input('Это займёт около полуминуты');

  private static readonly PHRASES = [
    'Изучаем вашу самооценку…',
    'Сверяемся с профилем должности…',
    'Ищем точки роста…',
    'Подбираем лучшие практики развития…',
    'Раскладываем всё по модели 70/20/10…',
    'Советуемся с нейросетью…',
    'Расставляем приоритеты…',
    'Намечаем реалистичные сроки…',
    'Ищем, где вы себя недооценили…',
    'Просим ассистента перечитать черновик на свежую голову…',
    'Наводим блеск…',
    'Почти готово…',
  ];

  private readonly index = signal(0);
  readonly phrase = signal(GenerationOverlayComponent.PHRASES[0]);

  constructor() {
    const phrases = GenerationOverlayComponent.PHRASES;
    const timer = setInterval(() => {
      // Доходим до последней фразы и остаёмся на ней (генерация может затянуться).
      const next = Math.min(this.index() + 1, phrases.length - 1);
      this.index.set(next);
      this.phrase.set(phrases[next]);
    }, 2300);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
