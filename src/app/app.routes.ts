import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/title/title').then((m) => m.Title) },
  { path: 'game', loadComponent: () => import('./features/game/game').then((m) => m.Game) },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'records',
    loadComponent: () => import('./features/records/records').then((m) => m.Records),
  },
  { path: '**', redirectTo: '' },
];
