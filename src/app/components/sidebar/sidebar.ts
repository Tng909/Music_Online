import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LibraryService } from '../../services/library.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private library = inject(LibraryService);

  playlists = this.library.playlists;
  activeFilter = this.library.activeFilter;

  filters = ['Playlists', 'Artists', 'Albums'] as const;

  setFilter(f: (typeof this.filters)[number]): void {
    this.library.setFilter(f);
  }
}
