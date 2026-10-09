import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlayerService } from '../../services/player.service';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink],
  templateUrl: './topbar.html',
})
export class Topbar {
  private router = inject(Router);
  player = inject(PlayerService);
  searchQuery = signal('');

  goBack(): void {
    window.history.back();
  }

  goForward(): void {
    window.history.forward();
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
    if (this.router.url !== '/search') {
      this.router.navigate(['/search'], { queryParams: { q: value } });
    } else {
      this.router.navigate([], { queryParams: { q: value || null }, queryParamsHandling: 'merge' });
    }
  }
}
