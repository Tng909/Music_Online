import { Component, inject, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LibraryService } from '../../services/library.service';
import { MusicService } from '../../services/music.service';
import { DownloadService } from '../../services/download.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
import { UserLibraryService } from '../../services/user-library.service';
import { UserCollection } from '../../data/music-data';

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
  mine = inject(UserLibraryService);
  private router = inject(Router);


  /** Only albums the user added (plus their own, listed separately). */
  albums = this.library.albums;
  playlists = this.library.playlists;
  artists = this.library.artists;
  ownPlaylists = this.library.ownPlaylists;
  activeFilter = this.library.activeFilter;
  downloadCount = this.downloads.count;
  likedCount = this.player.likedCount;
  userId = computed(() => this.auth.user()?.id ?? null);

  filters = ['Playlists', 'Artists', 'Albums'] as const;

  /** + menu state. */
  menuOpen = signal(false);

  constructor() {
    void this.mine.load();
  }

  setFilter(f: (typeof this.filters)[number]): void {
    this.library.setFilter(f);
  }

  toggleMenu(): void {
    if (!this.auth.loggedIn()) {
      void this.router.navigate(['/login']);
      return;
    }
    this.menuOpen.update((v) => !v);
  }

  openCreate(kind: UserCollection['kind']): void {
    if (!this.auth.loggedIn()) {
      void this.router.navigate(['/login']);
      return;
    }
    this.menuOpen.set(false);
    void this.router.navigate(['/create', kind]);
  }

  removeAlbum(id: string): void {
    void this.library.toggleSaveAlbum(id);
  }

  playAlbum(id: string): void {
    const album = this.music.getAlbum(id);
    if (album?.tracks.length) this.player.playTrack(album.tracks[0], album.tracks, { type: 'album', id: album.id, name: album.title });
  }

  playCollection(id: string): void {
    const c = this.mine.get(id);
    if (!c) return;
    const tracks = this.mine.tracksOf(c);
    if (tracks.length) this.player.playTrack(tracks[0], tracks, { type: 'collection', id: c.id, name: c.title });
  }
}

