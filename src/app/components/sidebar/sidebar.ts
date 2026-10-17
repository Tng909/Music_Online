import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LibraryService } from '../../services/library.service';
import { MusicService } from '../../services/music.service';
import { DownloadService } from '../../services/download.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private library = inject(LibraryService);
  music = inject(MusicService);
  private downloads = inject(DownloadService);
  private player = inject(PlayerService);
  private auth = inject(AuthService);

  playlists = this.library.playlists;
  artists = this.library.artists;
  activeFilter = this.library.activeFilter;
  downloadCount = this.downloads.count;
  likedCount = this.player.likedCount;
  userId = computed(() => this.auth.user()?.id ?? null);

  filters = ['Playlists', 'Artists', 'Albums'] as const;

  setFilter(f: (typeof this.filters)[number]): void {
    this.library.setFilter(f);
  }

  createPlaylist(): void {
    void this.library.createPlaylist();
  }
}

