import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { MusicService } from '../../services/music.service';
import { AdminService } from '../../services/admin.service';
import { AdminDashboard } from './dashboard/dashboard';
import { AdminSongs } from './songs/songs';
import { AdminArtists } from './artists/artists';
import { AdminPlaylists } from './playlists/playlists';
import { AdminAccounts } from './accounts/accounts';
import { AdminHistory } from './history/history';
import { AdminContacts } from './contacts/contacts';

export type AdminTab = 'dashboard' | 'songs' | 'artists' | 'playlists' | 'accounts' | 'contacts' | 'history';

const TABS: Array<{ id: AdminTab; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'songs', label: 'Songs', icon: '🎵' },
  { id: 'artists', label: 'Artists', icon: '🎤' },
  { id: 'playlists', label: 'Playlists', icon: '🎧' },
  { id: 'accounts', label: 'Accounts', icon: '👥' },
  { id: 'contacts', label: 'Contacts', icon: '✉️' },
  { id: 'history', label: 'History', icon: '📜' },
];

@Component({
  selector: 'app-admin',
  imports: [AdminDashboard, AdminSongs, AdminArtists, AdminPlaylists, AdminAccounts, AdminContacts, AdminHistory],
  templateUrl: './admin.html',
})
export class AdminPage {
  auth = inject(AuthService);
  music = inject(MusicService);
  admin = inject(AdminService);

  tabs = TABS;
  active = signal<AdminTab>('dashboard');

  title = computed(() => this.tabs.find((t) => t.id === this.active())?.label ?? 'Dashboard');
}
