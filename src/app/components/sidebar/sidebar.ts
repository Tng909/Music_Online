import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LibraryService } from '../../services/library.service';
import { MusicService } from '../../services/music.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private library = inject(LibraryService);
  music = inject(MusicService);

  playlists = this.music.playlists;
  activeFilter = this.library.activeFilter;

  filters = ['Playlists', 'Artists', 'Albums'] as const;

  setFilter(f: (typeof this.filters)[number]): void {
    this.library.setFilter(f);
  }
}

