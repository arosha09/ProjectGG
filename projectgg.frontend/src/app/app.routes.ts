import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { Dashboard } from './pages/dashboard/dashboard';
import { ProfileComponent } from './pages/profile/profile.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { VerifyEmailComponent } from './pages/verify-email/verify-email.component';
import { AdminDashboard } from './pages/admin/dashboard/admin-dashboard';
import { AdminSync } from './pages/admin/sync/admin-sync';
import { SteamCallbackComponent } from './pages/steam-callback/steam-callback.component';
import { DiscordCallbackComponent } from './pages/discord-callback/discord-callback.component';
import { SpotifyCallbackComponent } from './pages/spotify-callback/spotify-callback.component';
import { YoutubeMusicCallbackComponent } from './pages/youtube-music-callback/youtube-music-callback.component';
import { AppleMusicCallbackComponent } from './pages/apple-music-callback/apple-music-callback.component';
import { ChatComponent } from './pages/chat/chat.component';
import { GgChatComponent } from './pages/gg-chat/gg-chat.component';
import { TasksComponent } from './pages/tasks/tasks.component';
import { AuthGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: Home
  },
  {
    path: 'login',
    component: Login
  },
  {
    path: 'register',
    component: Register
  },
  {
    path: 'dashboard',
    component: Dashboard,
    canActivate: [AuthGuard]
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'settings',
    component: SettingsComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'auth/steam/callback',
    component: SteamCallbackComponent,
  },
  {
    path: 'auth/discord/callback',
    component: DiscordCallbackComponent,
  },
  {
    path: 'auth/spotify/callback',
    component: SpotifyCallbackComponent,
  },
  {
    path: 'auth/youtube-music/callback',
    component: YoutubeMusicCallbackComponent,
  },
  {
    path: 'auth/apple-music/callback',
    component: AppleMusicCallbackComponent,
  },
  {
    path: 'chat',
    component: ChatComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'gg-chat',
    component: GgChatComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'tasks',
    component: TasksComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'verify-email',
    component: VerifyEmailComponent,
  },
  {
    path: 'admin',
    component: AdminDashboard,
    canActivate: [AuthGuard]
  },
  {
    path: 'admin/sync',
    component: AdminSync,
    canActivate: [AuthGuard]
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];

