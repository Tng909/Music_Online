<<<<<<< HEAD
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
=======
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
>>>>>>> 23115d0fc954786fc23e5336ee0318260cca739c
import { LibraryService } from '../../services/library.service';
import { MusicService } from '../../services/music.service';
import { DownloadService } from '../../services/download.service';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';
<<<<<<< HEAD
import { UserLibraryService } from '../../services/user-library.service';
import { UserCollection } from '../../data/music-data';
=======
>>>>>>> 23115d0fc954786fc23e5336ee0318260cca739c

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private library = inject(LibraryService);
  music = inject(MusicService);
  private downloads = inject(DownloadService);
<<<<<<< HEAD
  player = inject(PlayerService);
  auth = inject(AuthService);
  mine = inject(UserLibraryService);
  private router = inject(Router);

  playlists = this.music.playlists;
  artists = this.music.artists;
  albums = this.music.albums;
=======
  private player = inject(PlayerService);
  private auth = inject(AuthService);

  playlists = this.library.playlists;
  artists = this.library.artists;
>>>>>>> 23115d0fc954786fc23e5336ee0318260cca739c
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

<<<<<<< HEAD
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

  playAlbum(id: string): void {
    const album = this.music.getAlbum(id);
    if (album?.tracks.length) this.player.playTrack(album.tracks[0], album.tracks, { type: 'album', id: album.id, name: album.title });
  }

  playCollection(id: string): void {
    const c = this.mine.get(id);
    if (!c) return;
    const tracks = this.mine.tracksOf(c);
    if (tracks.length) this.player.playTrack(tracks[0], tracks, { type: 'collection', id: c.id, name: c.title });
=======
  createPlaylist(): void {
    void this.library.createPlaylist();
>>>>>>> 23115d0fc954786fc23e5336ee0318260cca739c
  }
}

