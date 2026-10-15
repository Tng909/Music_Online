import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  { path: 'search', loadComponent: () => import('./pages/search/search').then((m) => m.Search) },
  { path: 'artist/:id', loadComponent: () => import('./pages/artist/artist').then((m) => m.ArtistPage) },
  { path: 'playlist/:id', loadComponent: () => import('./pages/playlist/playlist').then((m) => m.PlaylistPage) },
  { path: 'downloads', loadComponent: () => import('./pages/downloads/downloads').then((m) => m.Downloads) },
  { path: 'liked', loadComponent: () => import('./pages/liked/liked').then((m) => m.Liked) },
  { path: 'account', loadComponent: () => import('./pages/account/account').then((m) => m.Account) },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
  },
  { path: 'login', loadComponent: () => import('./pages/auth/login/login').then((m) => m.Login) },
  { path: 'signup', loadComponent: () => import('./pages/auth/signup/signup').then((m) => m.Signup) },
  { path: '**', redirectTo: '' },
];
