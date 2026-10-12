import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, AuthUser } from '../../services/auth.service';

/** Human-readable label for how the account was created. */
const PROVIDER_LABELS: Record<AuthUser['provider'], string> = {
  email: 'Email & password',
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
  phone: 'Phone number',
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
