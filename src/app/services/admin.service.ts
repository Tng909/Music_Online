import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './music.service';

export type AdminRole = 'user' | 'artist' | 'admin';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  role?: AdminRole;
  createdAt: string;
}

export interface StatsOverview {
  range: string;
  plays: number;
  accounts: number;
  playlists: number;
  songs: number;
  artists: number;
}

export interface HistoryItem {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

/** Admin-only API: CRUD + uploads + stats + history. Token comes from AuthService's login. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  private token(): string | null {
    return localStorage.getItem('music_online_token');
  }

  private headers(): Record<string, string> {
    const t = this.token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  private get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${API_URL}/admin${path}`, { headers: this.headers(), params }));
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`${API_URL}/admin${path}`, body, { headers: this.headers() }));
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`${API_URL}/admin${path}`, body, { headers: this.headers() }));
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`${API_URL}/admin${path}`, body, { headers: this.headers() }));
  }

  private del(path: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_URL}/admin${path}`, { headers: this.headers() }));
  }

  // ---- Songs / artists / playlists ----
  createSong(body: unknown): Promise<unknown> {
    return this.post('/songs', body);
  }
  updateSong(id: string, body: unknown): Promise<unknown> {
    return this.put(`/songs/${id}`, body);
  }
  deleteSong(id: string): Promise<void> {
    return this.del(`/songs/${id}`);
  }
  createArtist(body: unknown): Promise<unknown> {
    return this.post('/artists', body);
  }
  updateArtist(id: string, body: unknown): Promise<unknown> {
    return this.put(`/artists/${id}`, body);
  }
  deleteArtist(id: string): Promise<void> {
    return this.del(`/artists/${id}`);
  }
  createPlaylist(body: unknown): Promise<unknown> {
    return this.post('/playlists', body);
  }
  updatePlaylist(id: string, body: unknown): Promise<unknown> {
    return this.put(`/playlists/${id}`, body);
  }
  deletePlaylist(id: string): Promise<void> {
    return this.del(`/playlists/${id}`);
  }

  // ---- Uploads ----
  async uploadCover(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await firstValueFrom(
      this.http.post<{ url: string }>(`${API_URL}/admin/uploads/cover`, form, { headers: this.headers() }),
    );
    return res.url;
  }

  async uploadAudio(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await firstValueFrom(
      this.http.post<{ url: string }>(`${API_URL}/admin/uploads/audio`, form, { headers: this.headers() }),
    );
    return res.url;
  }

  // ---- Users ----
  listUsers(): Promise<AdminUser[]> {
    return this.get<AdminUser[]>('/users');
  }
  setUserRole(id: string, role: AdminRole): Promise<AdminUser> {
    return this.patch<AdminUser>(`/users/${id}`, { role });
  }
  deleteUser(id: string): Promise<void> {
    return this.del(`/users/${id}`);
  }

  // ---- Stats / history ----
  statsOverview(range: string): Promise<StatsOverview> {
    return this.get<StatsOverview>('/stats/overview', { range });
  }
  liveListeners(): Promise<{ listeners: number }> {
    return this.get<{ listeners: number }>('/stats/live');
  }
  history(params: Record<string, string | number>): Promise<{ items: HistoryItem[]; total: number; page: number; pages: number }> {
    return this.get('/history', params);
  }

  messageOf(err: unknown): string {
    const e = err as { error?: { error?: string }; status?: number };
    if (e?.error?.error) return e.error.error;
    if (e?.status === 0) return 'Cannot reach the server. Is `npm run server` running?';
    if (e?.status === 403) return 'Admin access required.';
    return 'Something went wrong. Please try again.';
  }
}

/** Local pagination helper shared by admin tabs (6 rows per page). */
export class Pager {
  readonly page = signal(1);
  readonly pageSize = 6;

  pages(total: number): number {
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  slice<T>(items: T[]): T[] {
    const p = Math.min(this.page(), this.pages(items.length));
    return items.slice((p - 1) * this.pageSize, p * this.pageSize);
  }

  pageText(total: number): string {
    return `${Math.min(this.page(), this.pages(total))} / ${this.pages(total)}`;
  }

  clamp(total: number): void {
    if (this.page() > this.pages(total)) this.page.set(this.pages(total));
    if (this.page() < 1) this.page.set(1);
  }

  /** Type a page number to jump (clamped to range). */
  goTo(raw: string, total: number): void {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    this.page.set(Math.max(1, Math.min(this.pages(total), n)));
  }
}

/** Shared admin search/filter/pagination state (not injectable — `new` per tab). */
export class AdminTabState extends Pager {
  readonly query = signal('');
  resetPage(): void {
    this.page.set(1);
  }
}
