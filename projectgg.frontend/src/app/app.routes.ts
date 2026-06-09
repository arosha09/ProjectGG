import { Routes } from '@angular/router';
import { AuthGuard } from './services/auth.guard';
import { AdminGuard } from './services/admin.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home').then(m => m.Home),
    data: { hideDivider: true }
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.Login),
    data: { hideDivider: true }
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then(m => m.Register),
    data: { hideDivider: true }
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
    canActivate: [AuthGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'auth/steam/callback',
    loadComponent: () => import('./pages/steam-callback/steam-callback.component').then(m => m.SteamCallbackComponent),
    data: { hideDivider: true }
  },
  {
    path: 'auth/discord/callback',
    loadComponent: () => import('./pages/discord-callback/discord-callback.component').then(m => m.DiscordCallbackComponent),
    data: { hideDivider: true }
  },
  {
    path: 'auth/spotify/callback',
    loadComponent: () => import('./pages/spotify-callback/spotify-callback.component').then(m => m.SpotifyCallbackComponent),
    data: { hideDivider: true }
  },
  {
    path: 'auth/youtube-music/callback',
    loadComponent: () => import('./pages/youtube-music-callback/youtube-music-callback.component').then(m => m.YoutubeMusicCallbackComponent),
    data: { hideDivider: true }
  },
  {
    path: 'auth/apple-music/callback',
    loadComponent: () => import('./pages/apple-music-callback/apple-music-callback.component').then(m => m.AppleMusicCallbackComponent),
    data: { hideDivider: true }
  },
  {
    path: 'chat',
    loadComponent: () => import('./pages/chat/chat.component').then(m => m.ChatComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'gg-chat',
    loadComponent: () => import('./pages/gg-chat/gg-chat.component').then(m => m.GgChatComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'tasks',
    loadComponent: () => import('./pages/tasks/tasks.component').then(m => m.TasksComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./pages/verify-email/verify-email.component').then(m => m.VerifyEmailComponent),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/dashboard/admin-dashboard').then(m => m.AdminDashboard),
    canActivate: [AuthGuard]
  },
  {
    path: 'admin/sync',
    loadComponent: () => import('./pages/admin/sync/admin-sync').then(m => m.AdminSync),
    canActivate: [AuthGuard]
  },
  {
    path: 'admin/tasks',
    loadComponent: () => import('./pages/admin/tasks-admin.component').then(m => m.TasksAdminComponent),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'admin/settings',
    loadComponent: () => import('./pages/admin/settings/admin-settings.component').then(m => m.AdminSettingsComponent),
    canActivate: [AuthGuard, AdminGuard]
  },
  {
    path: 'gifts',
    loadComponent: () => import('./pages/gifts/gift-tracking.component').then(m => m.GiftTrackingComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'gg-chat/server/:id/settings',
    loadComponent: () => import('./pages/server-settings/server-settings.component').then(m => m.ServerSettingsComponent),
    canActivate: [AuthGuard]
  },
  {
    path: '404',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
