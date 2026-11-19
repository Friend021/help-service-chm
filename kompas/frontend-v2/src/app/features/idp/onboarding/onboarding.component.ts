import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { ApiError } from '../../../core/api/api-error';
import { StageIndicatorComponent } from '../../../shared/components/stage-indicator/stage-indicator.component';
import { WorkflowStage, TargetPosition } from '../../../models/idp.models';

type Mode = 'none' | 'current' | 'target';

type NodeKind = 'block' | 'direction' | 'family' | 'leaf';

/** Узел дерева должностей (ветка или лист-грейд). */
interface OrgNode {
  key: string;
  label: string;
  kind: NodeKind;
  title?: string;        // только для листа — название должности
  children?: OrgNode[];
}

/** Плоская строка для отрисовки в @for (с учётом раскрытия/поиска). */
interface OrgRow {
  key: string;
  label: string;
  kind: NodeKind;
  depth: number;
  expanded: boolean;
  title?: string;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, StageIndicatorComponent],
  template: `
    <div class="onboarding-page">
      <app-stage-indicator
        [currentStage]="store.currentStage()"
        [steps]="store.stageLabels()"
        (navigate)="onStageNavigate($event)"
      />

      <div class="ob-scroll">
        <div class="ob-inner">
        <a class="back" href="#" (click)="$event.preventDefault()">
          <mat-icon>arrow_back</mat-icon> На главную
        </a>
        <h1>Создать ИПР: Компас</h1>
        <p class="sub">{{ subtitle() }}</p>
        <div class="rule"></div>

        <div class="sec-head">
          <h2>Подтверждение должностей</h2>
          <span class="step">Шаг 1 из 2</span>
        </div>

        <div class="radios" role="radiogroup" aria-label="Для какой должности строим ИПР">
          <button type="button" class="radio" [class.checked]="mode() === 'current'" (click)="selectMode('current')">
            <span class="dot"></span> ИПР для текущей должности
          </button>
          <button type="button" class="radio" [class.checked]="mode() === 'target'" (click)="selectMode('target')">
            <span class="dot"></span> ИПР для целевой должности
          </button>
        </div>

        <!-- Текущая должность -->
        @if (mode() === 'current') {
          <div class="pos-card">
            <div class="pos-title">Текущая должность:&nbsp; <b>{{ currentPosition() || '— не указана' }}</b></div>
            @if (store.context()?.managerFullName; as mgr) {
              <div class="crumb">Руководитель: {{ mgr }}</div>
            }
            <p class="fn-note">Индивидуальный план развития будет построен для вашей текущей должности.</p>
          </div>
        }

        <!-- Целевая должность -->
        @if (mode() === 'target') {
          <div class="info">
            <span class="i">!</span>
            <span>Важно: целевая должность определяет компетенционный профиль для опросника на следующем шаге</span>
          </div>

          <div class="picker-head">
            <div class="search">
              <input type="text" [value]="search()" (input)="search.set($any($event.target).value)"
                     placeholder="Введите название должности">
              <mat-icon class="mag">search</mat-icon>
            </div>
            <div class="tree-tools">
              <button type="button" class="tool" (click)="expandAll()" matTooltip="Развернуть всё" aria-label="Развернуть всё">
                <mat-icon>unfold_more</mat-icon>
              </button>
              <button type="button" class="tool" (click)="collapseAll()" matTooltip="Свернуть всё" aria-label="Свернуть всё">
                <mat-icon>unfold_less</mat-icon>
              </button>
            </div>
          </div>

          <div class="tree" role="tree">
            @for (row of visibleRows(); track row.key) {
              @if (row.kind === 'leaf') {
                <button type="button" class="node leaf" [class.checked]="selectedTarget() === row.title"
                        [style.paddingLeft.px]="12 + row.depth * 26"
                        role="treeitem" [attr.aria-selected]="selectedTarget() === row.title"
                        (click)="selectLeaf(row.title!)">
                  <span class="dot"></span>
                  <span class="nlabel">{{ row.label }}</span>
                </button>
              } @else {
                <button type="button" class="node branch" [class.fam]="row.kind === 'family'"
                        [style.paddingLeft.px]="12 + row.depth * 26"
                        role="treeitem" [attr.aria-expanded]="row.expanded"
                        (click)="toggle(row.key)">
                  <mat-icon class="chev" [class.open]="row.expanded">chevron_right</mat-icon>
                  <mat-icon class="kico">{{ row.kind === 'family' ? 'person' : 'folder' }}</mat-icon>
                  <span class="nlabel">{{ row.label }}</span>
                </button>
              }
            } @empty {
              <p class="roles-empty">Ничего не найдено по запросу «{{ search() }}».</p>
            }
          </div>

          @if (selectedPath(); as path) {
            <div class="crumbs"><b>Вы выбрали:</b> {{ path }}</div>
          }
        }

        @if (submitError(); as error) {
          <div class="submit-error" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ error }}</span>
          </div>
        }
        </div>
      </div>

      <footer class="idp-actionbar ob-foot">
        <button type="button" class="fbtn" (click)="goHome()">
          <mat-icon>arrow_back</mat-icon> Назад
        </button>
        <span class="idp-actionbar__spacer"></span>
        <button type="button" class="fbtn primary" [disabled]="!isFormValid() || submitting()" (click)="submit()">
          @if (submitting()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <span>Продолжить</span> <mat-icon>arrow_forward</mat-icon> }
        </button>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .onboarding-page { height: 100%; display: flex; flex-direction: column; min-height: 0; }
    .ob-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 22px 24px 20px; }
    .ob-inner { max-width: 1000px; margin: 0 auto; }

    .back { display: inline-flex; align-items: center; gap: 8px; color: #8a94a0; text-decoration: none; font-size: 14px; margin-bottom: 12px; }
    .back mat-icon { width: 17px; height: 17px; font-size: 17px; }
    h1 { margin: 0; font: 700 32px/1.1 var(--font-medium); letter-spacing: -.01em; color: #1f2733; }
    .sub { margin: 4px 0 0; color: #8a94a0; font-size: 15px; }
    .rule { height: 1px; background: #e3e6ea; margin: 18px 0 22px; }

    .sec-head { display: flex; align-items: baseline; gap: 16px; margin: 0 0 16px; }
    .sec-head h2 { margin: 0; font: 600 22px/1.2 var(--font-medium); color: #1f2733; }
    .sec-head .step { margin-left: auto; color: #8a94a0; font-size: 15px; }

    .radios { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
    .radio { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; font-size: 16px; color: #39424e; background: none; border: 0; padding: 0; }
    .radio .dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #a7afba; flex: 0 0 auto; display: grid; place-items: center; transition: border-color .12s; }
    .radio .dot::after { content: ""; width: 11px; height: 11px; border-radius: 50%; background: #1f6fd4; transform: scale(0); transition: transform .12s; }
    .radio.checked .dot { border-color: #1f6fd4; }
    .radio.checked .dot::after { transform: scale(1); }

    .pos-card { margin-top: 18px; background: #eef0f3; border-radius: 12px; padding: 20px 22px; max-width: 980px; }
    .pos-card .pos-title { font-size: 16px; color: #1f2733; }
    .pos-card .pos-title b { font-weight: 600; }
    .pos-card .crumb { margin: 6px 0 0; color: #8a94a0; font-size: 14px; }
    .pos-card .fn-note { margin: 14px 0 0; color: #39424e; font-size: 14px; }

    .info { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; background: #e9eef7; color: #2f6fd4; border-radius: 10px; padding: 14px 16px; max-width: 980px; font-size: 15px; line-height: 1.45; }
    .info .i { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; background: #1f6fd4; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; margin-top: 1px; }

    .picker-head { margin-top: 16px; max-width: 980px; display: flex; align-items: center; gap: 12px; }
    .search { position: relative; flex: 1 1 auto; }
    .search input { width: 100%; height: 52px; border: 1px solid #cdd3da; border-radius: 10px; background: #fbfcfd; padding: 0 46px 0 18px; font: inherit; font-size: 15px; color: #1f2733; }
    .search input::placeholder { color: #8a94a0; }
    .search .mag { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; font-size: 20px; color: #8a94a0; }

    .tree-tools { display: flex; gap: 6px; flex: 0 0 auto; }
    .tool { width: 44px; height: 44px; border: 1px solid #cdd3da; border-radius: 10px; background: #fbfcfd; color: #566070; display: grid; place-items: center; cursor: pointer; transition: background .12s, color .12s; }
    .tool:hover { background: #eef1f5; color: #1f2733; }
    .tool mat-icon { width: 22px; height: 22px; font-size: 22px; }

    .tree { margin-top: 14px; max-width: 980px; border: 1px solid #e3e6ea; border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 1px; max-height: 420px; overflow-y: auto; }
    .node { display: flex; align-items: center; gap: 10px; width: 100%; font-size: 15px; color: #39424e; cursor: pointer; background: none; border: 0; padding: 9px 10px; text-align: left; border-radius: 8px; }
    .node:hover { background: #f3f5f8; }
    .node .nlabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .branch .chev { width: 20px; height: 20px; font-size: 20px; color: #8a94a0; flex: 0 0 auto; transition: transform .15s; }
    .branch .chev.open { transform: rotate(90deg); }
    .branch .kico { width: 21px; height: 21px; font-size: 21px; flex: 0 0 auto; color: #f0a93b; }
    .branch.fam .kico { color: #7b8694; }
    .branch.fam { color: #1f2733; font-weight: 500; }

    .leaf { padding-top: 8px; padding-bottom: 8px; }
    .leaf .dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #a7afba; flex: 0 0 auto; display: grid; place-items: center; margin-left: 20px; }
    .leaf .dot::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #1f6fd4; transform: scale(0); transition: transform .12s; }
    .leaf.checked .dot { border-color: #1f6fd4; }
    .leaf.checked .dot::after { transform: scale(1); }
    .leaf.checked { color: #1f2733; font-weight: 500; }
    .roles-empty { color: #8a94a0; font-size: 14px; padding: 10px; }

    .crumbs { margin-top: 14px; max-width: 980px; color: #566070; font-size: 14px; line-height: 1.5; }
    .crumbs b { color: #1f2733; font-weight: 600; }

    .submit-error { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 12px; background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); border-radius: 8px; font-size: 0.875rem; max-width: 980px; }

    .ob-foot { flex: 0 0 auto; max-width: 1000px; width: 100%; margin: 0 auto; border-radius: 12px 12px 0 0; }
    .fbtn { display: inline-flex; align-items: center; gap: 8px; background: transparent; border: 0; color: #fff; font-size: 15px; font-weight: 600; padding: 6px 4px; cursor: pointer; }
    .fbtn mat-icon { width: 18px; height: 18px; font-size: 18px; }
    /* Первичное действие («Далее»): плоский светло-голубой текст со стрелкой, без заливки. */
    .fbtn.primary { color: #8fb8f5; }
    .fbtn.primary:disabled { color: rgba(255, 255, 255, .42); cursor: default; }

    @media (max-width: 720px) {
      .ob-scroll { padding: 18px 16px; }
      .ob-foot { margin: 0; border-radius: 0; }
      h1 { font-size: 26px; }
    }
  `],
})
export class OnboardingComponent {
  readonly store = inject(IdpStoreService);
  private readonly workflow = inject(IdpWorkflowService);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('none');
  readonly search = signal('');
  readonly selectedTarget = signal<string | null>(null);

  readonly submitError = signal('');
  readonly submitting = signal(false);

  readonly currentPosition = computed(() => this.store.context()?.currentPosition ?? '');

  readonly subtitle = computed(() =>
    this.mode() === 'none'
      ? 'Определите ключевую цель развития и составьте план действий для ее достижения'
      : 'Собрать индивидуальный план развития в диалоге с ИИ'
  );

  /** Ключи раскрытых веток (null = ещё не инициализировано → раскрыть всё по умолчанию). */
  readonly expanded = signal<Set<string> | null>(null);

  /** Дерево: Блок → Дирекция → семейство (careerTrack) → грейд (должность). */
  readonly tree = computed<OrgNode[]>(() => {
    const positions = this.store.targetPositions();
    // Фолбэк на плоский список названий, если бэк не отдал орг-путь.
    const rows: TargetPosition[] = positions.length
      ? positions
      : this.store.targetRoles().map(t => ({ title: t, careerTrack: null, orgBlock: null, orgDirection: null }));

    // Значение из контекста, если его нет в списке — добавим как отдельную ветку «Прочее».
    const ctxTarget = this.store.context()?.targetPosition;
    if (ctxTarget && !rows.some(r => r.title === ctxTarget)) {
      rows.unshift({ title: ctxTarget, careerTrack: null, orgBlock: null, orgDirection: null });
    }

    const blocks: OrgNode[] = [];
    const idx = new Map<string, OrgNode>();
    const child = (parent: OrgNode[], key: string, label: string, kind: NodeKind): OrgNode => {
      let node = idx.get(key);
      if (!node) {
        node = { key, label, kind, children: [] };
        idx.set(key, node);
        parent.push(node);
      }
      return node;
    };

    for (const p of rows) {
      const bLabel = p.orgBlock || 'Прочее';
      const dLabel = p.orgDirection || '—';
      const fLabel = p.careerTrack || p.title;
      const bKey = `b:${bLabel}`;
      const dKey = `${bKey}|d:${dLabel}`;
      const fKey = `${dKey}|f:${fLabel}`;
      const block = child(blocks, bKey, bLabel, 'block');
      const dir = child(block.children!, dKey, dLabel, 'direction');
      const fam = child(dir.children!, fKey, fLabel, 'family');
      fam.children!.push({ key: `${fKey}|p:${p.title}`, label: p.title, kind: 'leaf', title: p.title });
    }
    return blocks;
  });

  /** Все ключи веток — для «развернуть всё» и дефолтного раскрытия. */
  private readonly allBranchKeys = computed(() => {
    const keys: string[] = [];
    const walk = (nodes: OrgNode[]) => {
      for (const n of nodes) {
        if (n.children?.length) { keys.push(n.key); walk(n.children); }
      }
    };
    walk(this.tree());
    return keys;
  });

  /** Плоский список видимых строк с учётом поиска и раскрытия. */
  readonly visibleRows = computed<OrgRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    const open = this.expanded() ?? new Set(this.allBranchKeys());
    const rows: OrgRow[] = [];

    if (q) {
      // Режим поиска: показываем ветки с совпадениями, принудительно раскрытые.
      const filter = (nodes: OrgNode[], depth: number, forceAll: boolean): OrgRow[] => {
        const out: OrgRow[] = [];
        for (const n of nodes) {
          if (n.kind === 'leaf') {
            if (forceAll || n.label.toLowerCase().includes(q)) {
              out.push({ key: n.key, label: n.label, kind: 'leaf', depth, expanded: false, title: n.title });
            }
            continue;
          }
          const selfMatch = n.label.toLowerCase().includes(q);
          const kids = filter(n.children ?? [], depth + 1, forceAll || selfMatch);
          if (selfMatch || kids.length) {
            out.push({ key: n.key, label: n.label, kind: n.kind, depth, expanded: true });
            out.push(...kids);
          }
        }
        return out;
      };
      return filter(this.tree(), 0, false);
    }

    const walk = (nodes: OrgNode[], depth: number) => {
      for (const n of nodes) {
        if (n.kind === 'leaf') {
          rows.push({ key: n.key, label: n.label, kind: 'leaf', depth, expanded: false, title: n.title });
          continue;
        }
        const isOpen = open.has(n.key);
        rows.push({ key: n.key, label: n.label, kind: n.kind, depth, expanded: isOpen });
        if (isOpen) walk(n.children ?? [], depth + 1);
      }
    };
    walk(this.tree(), 0);
    return rows;
  });

  /** Крошки «Блок → Дирекция → Семейство → Должность» для выбранной должности. */
  readonly selectedPath = computed(() => {
    const title = this.selectedTarget();
    if (!title) return '';
    const p = this.store.targetPositions().find(r => r.title === title);
    if (!p) return title;
    const parts = [p.orgBlock, p.orgDirection, p.careerTrack, p.title].filter((x): x is string => !!x);
    // Убираем подряд идущие дубли (напр. семейство == название должности у одногрейдовых).
    return parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(' → ');
  });

  readonly isFormValid = computed(() => {
    if (this.mode() === 'current') return this.currentPosition().trim().length > 0;
    if (this.mode() === 'target') return !!this.selectedTarget()?.trim();
    return false;
  });

  constructor() {
    // Предзаполняем целевую из контекста, как только он загрузится (один раз).
    let inited = false;
    effect(() => {
      const ctxTarget = this.store.context()?.targetPosition;
      if (!inited && ctxTarget) {
        this.selectedTarget.set(ctxTarget);
        this.expandAncestors(ctxTarget);
        inited = true;
      }
    });
  }

  selectMode(mode: Mode): void {
    this.mode.set(mode);
    this.submitError.set('');
  }

  toggle(key: string): void {
    const next = new Set(this.expanded() ?? this.allBranchKeys());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.expanded.set(next);
  }

  expandAll(): void {
    this.expanded.set(new Set(this.allBranchKeys()));
  }

  collapseAll(): void {
    this.expanded.set(new Set());
  }

  selectLeaf(title: string): void {
    this.selectedTarget.set(title);
    this.expandAncestors(title);
  }

  /** Раскрывает блок/дирекцию/семейство выбранной должности, чтобы она была видна. */
  private expandAncestors(title: string): void {
    const p = this.store.targetPositions().find(r => r.title === title);
    if (!p) return;
    const bLabel = p.orgBlock || 'Прочее';
    const dLabel = p.orgDirection || '—';
    const fLabel = p.careerTrack || p.title;
    const bKey = `b:${bLabel}`;
    const dKey = `${bKey}|d:${dLabel}`;
    const fKey = `${dKey}|f:${fLabel}`;
    const next = new Set(this.expanded() ?? this.allBranchKeys());
    next.add(bKey); next.add(dKey); next.add(fKey);
    this.expanded.set(next);
  }

  async submit(): Promise<void> {
    if (!this.isFormValid() || this.submitting()) return;
    const current = this.currentPosition().trim();
    const target = this.mode() === 'current' ? current : (this.selectedTarget() ?? '').trim();
    this.submitError.set('');
    this.submitting.set(true);
    try {
      await this.workflow.submitManualContext(current, target);
      this.router.navigate(['/idp/assessment']);
    } catch (error) {
      const apiError = error as ApiError;
      this.submitError.set(apiError?.message ?? 'Не удалось сохранить должности. Попробуйте ещё раз.');
    } finally {
      this.submitting.set(false);
    }
  }

  goHome(): void {
    const url = this.store.context()?.returnUrl;
    if (url) { window.location.href = url; return; }
    this.router.navigate(['/idp/onboarding']);
  }

  onStageNavigate(stage: WorkflowStage): void {
    if (!this.workflow.canActivateStage(stage)) return;
  }
}
