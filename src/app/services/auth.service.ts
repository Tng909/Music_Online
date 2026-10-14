import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './music.service';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  provider: 'email';
  phone?: string | null;
  createdAt: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

/**
 * Talks to the Express auth API (server/data/users.json).
 * The session token is kept in localStorage; the user object in a signal.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private static readonly TOKEN_KEY = 'music_online_token';
  private token: string | null = localStorage.getItem(AuthService.TOKEN_KEY);

  readonly user = signal<AuthUser | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly loggedIn = computed(() => this.user() !== null);

  constructor() {
    if (this.token) void this.restore();
  }

  clearError(): void {
    this.error.set(null);
  }

  signup(email: string, password: string): Promise<boolean> {
    return this.send('/signup', { email, password });
  }

  login(email: string, password: string): Promise<boolean> {
    return this.send('/login', { email, password });
  }

  async logout(): Promise<void> {
    const token = this.token;
    this.setSession(null, null);
    if (token) {
      try {
        await firstValueFrom(
          this.http.post<void>(`${API_URL}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }),
        );
      } catch {
        // Server offline — the local session is cleared anyway.
      }
    }
  }

  private async send(path: string, body: unknown): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.http.post<AuthResponse>(`${API_URL}/auth${path}`, body));
      this.setSession(res.token, res.user);
      void this.router.navigate(['/']);
      return true;
    } catch (e) {
      this.error.set(this.messageOf(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private async restore(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ user: AuthUser }>(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${this.token}` },
        }),
      );
      this.setSession(this.token, res.user, false);
    } catch {
      // Expired or invalid token — drop it.
      this.setSession(null, null);
    }
  }

  private setSession(token: string | null, user: AuthUser | null, navigate = false): void {
    this.token = token;
    if (token) localStorage.setItem(AuthService.TOKEN_KEY, token);
    else localStorage.removeItem(AuthService.TOKEN_KEY);
    this.user.set(user);
    if (navigate) void this.router.navigate(['/']);
  }

  private messageOf(err: unknown): string {
    const e = err as { error?: { error?: string }; status?: number };
    if (e?.error?.error) return e.error.error;
    if (e?.status === 0) return 'Cannot reach the server. Is `npm run server` running?';
    return 'Something went wrong. Please try again.';
  }
}
