import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'entry',
    loadComponent: () => import('./entry/entry.component').then((m) => m.EntryComponent)
  },
  {
    path: 'chat/:sessionId',
    loadComponent: () => import('./chat/chat.component').then((m) => m.ChatComponent)
  },
  { path: '', pathMatch: 'full', redirectTo: 'entry' },
  { path: '**', redirectTo: 'entry' }
];
