import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  readonly activeFilter = signal<'Playlists' | 'Artists' | 'Albums'>('Playlists');

  setFilter(f: 'Playlists' | 'Artists' | 'Albums'): void {
    this.activeFilter.set(f);
  }
}

