import { Injectable, signal } from '@angular/core';
import { PLAYLISTS, Playlist } from '../data/music-data';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  readonly playlists = signal<Playlist[]>(PLAYLISTS);
  readonly activeFilter = signal<'Playlists' | 'Artists' | 'Albums'>('Playlists');

  getPlaylist(id: string): Playlist | undefined {
    return this.playlists().find((p) => p.id === id);
  }

  setFilter(f: 'Playlists' | 'Artists' | 'Albums'): void {
    this.activeFilter.set(f);
  }
}
