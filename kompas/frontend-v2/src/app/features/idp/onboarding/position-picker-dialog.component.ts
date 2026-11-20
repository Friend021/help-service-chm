import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TargetPosition } from '../../../models/idp.models';

export interface PositionPickerData {
  positions: TargetPosition[];
  selected: string | null;
}

type NodeKind = 'block' | 'direction' | 'family' | 'leaf';

interface OrgNode {
  key: string;
  label: string;
  kind: NodeKind;
  title?: string;
  children?: OrgNode[];
}

interface OrgRow {
  key: string;
  label: string;
  kind: NodeKind;
  depth: number;
  expanded: boolean;
  title?: string;
}

/** Модалка «Выберите должность»: дерево Блок → Дирекция → семейство → грейд. */
@Component({
  selector: 'app-position-picker-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <h2 mat-dialog-title>Выберите должность</h2>

    <mat-dialog-content>
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
            <button type="button" class="node leaf" [class.checked]="selected() === row.title"
                    [style.paddingLeft.px]="12 + row.depth * 26"
                    role="treeitem" [attr.aria-selected]="selected() === row.title"
                    (click)="selectLeaf(row.title!)">
              <span class="dot"></span>
              <span class="nlabel">@for (seg of highlight(row.label); track $index) {<span [class.hit]="seg.hit">{{ seg.text }}</span>}</span>
            </button>
          } @else {
            <button type="button" class="node branch" [class.fam]="row.kind === 'family'"
                    [style.paddingLeft.px]="12 + row.depth * 26"
                    role="treeitem" [attr.aria-expanded]="row.expanded"
                    (click)="toggle(row.key)">
              <mat-icon class="chev" [class.open]="row.expanded">chevron_right</mat-icon>
              <mat-icon class="kico">{{ row.kind === 'family' ? 'person' : 'folder' }}</mat-icon>
              <span class="nlabel">@for (seg of highlight(row.label); track $index) {<span [class.hit]="seg.hit">{{ seg.text }}</span>}</span>
            </button>
          }
        } @empty {
          <p class="roles-empty">Ничего не найдено по запросу «{{ search() }}».</p>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions>
      @if (selectedPath(); as path) {
        <div class="crumbs"><b>Вы выбрали:</b> {{ path }}</div>
      }
      <span class="spacer"></span>
      <button mat-button mat-dialog-close>Отмена</button>
      <button mat-button color="primary" class="go" [disabled]="!selected()" (click)="confirm()">Продолжить</button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host { display: block; }
    h2[mat-dialog-title] { font: 600 20px/1.3 var(--font-medium); color: #1f2733; }

    .picker-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .search { position: relative; flex: 1 1 auto; }
    .search input { width: 100%; height: 48px; border: 1px solid #cdd3da; border-radius: 10px; background: #fbfcfd; padding: 0 44px 0 16px; font: inherit; font-size: 15px; color: #1f2733; box-sizing: border-box; }
    .search input::placeholder { color: #8a94a0; }
    .search .mag { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; font-size: 20px; color: #8a94a0; }

    .tree-tools { display: flex; gap: 6px; flex: 0 0 auto; }
    .tool { width: 42px; height: 42px; border: 1px solid #cdd3da; border-radius: 10px; background: #fbfcfd; color: #566070; display: grid; place-items: center; cursor: pointer; transition: background .12s, color .12s; }
    .tool:hover { background: #eef1f5; color: #1f2733; }
    .tool mat-icon { width: 22px; height: 22px; font-size: 22px; }

    .tree { border: 1px solid #e3e6ea; border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 1px; min-height: 280px; max-height: 44vh; overflow-y: auto; }
    .node { display: flex; align-items: center; gap: 10px; width: 100%; font-size: 15px; color: #39424e; cursor: pointer; background: none; border: 0; padding: 9px 10px; text-align: left; border-radius: 8px; }
    .node:hover { background: #f3f5f8; }
    .node .nlabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .node .nlabel .hit { background: #ffe08a; color: #5a3d00; border-radius: 3px; padding: 0 1px; font-weight: 600; }

    .branch .chev { width: 20px; height: 20px; font-size: 20px; color: #8a94a0; flex: 0 0 auto; transition: transform .15s; }
    .branch .chev.open { transform: rotate(90deg); }
    .branch .kico { width: 21px; height: 21px; font-size: 21px; flex: 0 0 auto; color: #f0a93b; }
    .branch.fam .kico { color: #7b8694; }
    .branch.fam { color: #1f2733; font-weight: 500; }

    .leaf .dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #a7afba; flex: 0 0 auto; display: grid; place-items: center; margin-left: 20px; }
    .leaf .dot::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #1f6fd4; transform: scale(0); transition: transform .12s; }
    .leaf.checked .dot { border-color: #1f6fd4; }
    .leaf.checked .dot::after { transform: scale(1); }
    .leaf.checked { color: #1f2733; font-weight: 500; }
    .roles-empty { color: #8a94a0; font-size: 14px; padding: 10px; }

    mat-dialog-actions { gap: 8px; flex-wrap: wrap; padding: 12px 24px 16px; }
    .crumbs { color: #566070; font-size: 13.5px; line-height: 1.4; flex: 1 1 260px; min-width: 0; }
    .crumbs b { color: #1f2733; font-weight: 600; }
    .spacer { flex: 1 1 auto; }
    .go { font-weight: 600; --mdc-text-button-label-text-color: #0961a4; }
  `],
})
export class PositionPickerDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PositionPickerDialogComponent, string>);
  private readonly data = inject<PositionPickerData>(MAT_DIALOG_DATA);

  readonly search = signal('');
  readonly selected = signal<string | null>(this.data.selected ?? null);
  /**
   * Набор раскрытых веток. По умолчанию дерево свёрнуто (пустой набор);
   * если должность уже выбрана (режим «изменить») — раскрываем путь до неё,
   * чтобы выбранный пункт был сразу виден.
   */
  readonly expanded = signal<Set<string>>(this.pathToSelected());

  readonly tree = computed<OrgNode[]>(() => {
    const rows = this.data.positions ?? [];
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

  readonly visibleRows = computed<OrgRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    const open = this.expanded();

    if (q) {
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

    const rows: OrgRow[] = [];
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

  readonly selectedPath = computed(() => {
    const title = this.selected();
    if (!title) return '';
    const p = (this.data.positions ?? []).find(r => r.title === title);
    if (!p) return title;
    const parts = [p.orgBlock, p.orgDirection, p.careerTrack, p.title].filter((x): x is string => !!x);
    return parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(' → ');
  });

  toggle(key: string): void {
    const next = new Set(this.expanded());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.expanded.set(next);
  }

  /** Ключи веток Блок → Дирекция → семейство для уже выбранной должности (для авто-раскрытия). */
  private pathToSelected(): Set<string> {
    const set = new Set<string>();
    const title = this.data.selected;
    if (!title) return set;
    const p = (this.data.positions ?? []).find(r => r.title === title);
    if (!p) return set;
    const bKey = `b:${p.orgBlock || 'Прочее'}`;
    const dKey = `${bKey}|d:${p.orgDirection || '—'}`;
    const fKey = `${dKey}|f:${p.careerTrack || p.title}`;
    set.add(bKey);
    set.add(dKey);
    set.add(fKey);
    return set;
  }

  expandAll(): void { this.expanded.set(new Set(this.allBranchKeys())); }
  collapseAll(): void { this.expanded.set(new Set()); }

  selectLeaf(title: string): void { this.selected.set(title); }

  /** Разбивает метку на сегменты, помечая hit=true у частей, совпавших с поисковым запросом. */
  highlight(label: string): { text: string; hit: boolean }[] {
    const q = this.search().trim();
    if (!q) return [{ text: label, hit: false }];
    const lower = label.toLowerCase();
    const ql = q.toLowerCase();
    const parts: { text: string; hit: boolean }[] = [];
    let i = 0;
    while (i < label.length) {
      const idx = lower.indexOf(ql, i);
      if (idx < 0) {
        parts.push({ text: label.slice(i), hit: false });
        break;
      }
      if (idx > i) parts.push({ text: label.slice(i, idx), hit: false });
      parts.push({ text: label.slice(idx, idx + q.length), hit: true });
      i = idx + q.length;
    }
    return parts;
  }

  confirm(): void {
    if (this.selected()) this.dialogRef.close(this.selected()!);
  }
}
