import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, AuthUser } from '../../services/auth.service';

/** Human-readable label for how the account was created. */
const PROVIDER_LABELS: Record<AuthUser['provider'], string> = {
  email: 'Email & password',
};

@Component({
  selector: 'app-account',
  imports: [RouterLink],
  templateUrl: './account.html',
})
export class Account {
  auth = inject(AuthService);
  private router = inject(Router);

  /** The signed-in user, or null when the session has expired. */
  readonly user = computed(() => this.auth.user());

  readonly providerLabel = computed(() => {
    const user = this.auth.user();
    return user ? PROVIDER_LABELS[user.provider] : '—';
  });

  /** Formatted member-since date, e.g. "12 October 2026". */
  readonly memberSince = computed(() => {
    const created = this.auth.user()?.createdAt;
    if (!created) return '—';
    const date = new Date(created);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  });

  readonly initial = computed(() => {
    const user = this.auth.user();
    if (!user) return '?';
    return (user.name || user.email || user.phone || '?').trim().charAt(0).toUpperCase();
  });

  /** Profile picture upload in progress / last error. */
  readonly avatarBusy = signal(false);
  readonly avatarError = signal<string | null>(null);

  async onAvatarFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // picking the same picture again still fires (change)
    if (!file) return;
    if (!file.type.startsWith('image/')) return this.avatarError.set('Profile picture must be an image.');
    if (file.size > 5 * 1024 * 1024) return this.avatarError.set('Profile picture must be 5 MB or smaller.');
    await this.avatarAction(() => this.auth.setAvatar(file));
  }

  removeAvatar(): Promise<void> {
    return this.avatarAction(() => this.auth.removeAvatar());
  }

  private async avatarAction(fn: () => Promise<void>): Promise<void> {
    this.avatarBusy.set(true);
    this.avatarError.set(null);
    try {
      await fn();
    } catch (e) {
      const err = e as { error?: { error?: string } };
      this.avatarError.set(err.error?.error ?? 'Could not update the profile picture. Try again.');
    } finally {
      this.avatarBusy.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  /** No session -> nothing to manage, so fall back to log in. */
  constructor() {
    if (!this.auth.user()) {
      void this.router.navigate(['/login']);
    }
  }
}
