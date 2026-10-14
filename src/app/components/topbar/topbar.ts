import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlayerService } from '../../services/player.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink],
  templateUrl: './topbar.html',
})
export class Topbar {
  private router = inject(Router);
  player = inject(PlayerService);
  auth = inject(AuthService);
  private elementRef = inject(ElementRef);
  searchQuery = signal('');

  /** True while the account dropdown is expanded. */
  readonly menuOpen = signal(false);

  goBack(): void {
    window.history.back();
  }

  goForward(): void {
    window.history.forward();
  }

  /** First letter of the display name (or email/phone) for the avatar. */
  avatarLetter(): string {
    const u = this.auth.user();
    if (!u) return '?';
    const source = u.name || u.email || u.phone || '?';
    return source.trim().charAt(0).toUpperCase();
  }

  /** Toggle the account dropdown from the avatar button. */
  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Close the dropdown when clicking anywhere outside the top bar. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.menuOpen.set(false);
    }
  }

  /** Close on Escape, like a native menu. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
  }

  goToAccount(): void {
    this.menuOpen.set(false);
    void this.router.navigate(['/account']);
  }

  goToAdmin(): void {
    this.menuOpen.set(false);
    void this.router.navigate(['/admin']);
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
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
