import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './music.service';
import { Track, UserCollection } from '../data/music-data';
import { MusicService } from './music.service';

/** Personal library: the logged-in user's own playlists / albums / folders. */
@Injectable({ providedIn: 'root' })
export class UserLibraryService {
  private http = inject(HttpClient);
  private music = inject(MusicService);

  private collectionsSignal = signal<UserCollection[]>([]);
  readonly collections = this.collectionsSignal.asReadonly();

  readonly playlists = computed(() => this.collectionsSignal().filter((c) => c.kind === 'playlist'));
  readonly albums = computed(() => this.collectionsSignal().filter((c) => c.kind === 'album'));
  readonly folders = computed(() => this.collectionsSignal().filter((c) => c.kind === 'folder'));

  private headers(): Record<string, string> {
    const t = localStorage.getItem('music_online_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  /** Load my collections — silently empty when logged out or offline. */
  async load(): Promise<void> {
    try {
      const list = await firstValueFrom(
        this.http.get<UserCollection[]>(`${API_URL}/me/collections`, { headers: this.headers() }),
      );
      this.collectionsSignal.set(Array.isArray(list) ? list : []);
    } catch {
      this.collectionsSignal.set([]);
    }
  }

  get(id: string): UserCollection | undefined {
    return this.collectionsSignal().find((c) => c.id === id);
  }

  /** Resolved song objects for a collection, in order. */
  tracksOf(c: UserCollection): Track[] {
    return (c.trackIds || [])
      .map((id) => this.music.getSong(id))
      .filter((t): t is Track => !!t);
  }

  async create(kind: UserCollection['kind'], title: string, trackIds: string[] = []): Promise<UserCollection> {
    const c = await firstValueFrom(
      this.http.post<UserCollection>(
        `${API_URL}/me/collections`,
        { kind, title, trackIds },
        { headers: this.headers() },
      ),
    );
    this.collectionsSignal.update((list) => [c, ...list]);
    return c;
  }

  async rename(id: string, title: string): Promise<void> {
    const c = await firstValueFrom(
      this.http.put<UserCollection>(`${API_URL}/me/collections/${id}`, { title }, { headers: this.headers() }),
    );
    this.collectionsSignal.update((list) => list.map((x) => (x.id === id ? c : x)));
  }

  async addTracks(id: string, trackIds: string[]): Promise<void> {
    const c = await firstValueFrom(
      this.http.post<UserCollection>(`${API_URL}/me/collections/${id}/tracks`, { trackIds }, { headers: this.headers() }),
    );
    this.collectionsSignal.update((list) => list.map((x) => (x.id === id ? c : x)));
  }

  async removeTrack(id: string, trackId: string): Promise<void> {
    const c = await firstValueFrom(
      this.http.delete<UserCollection>(`${API_URL}/me/collections/${id}/tracks/${trackId}`, { headers: this.headers() }),
    );
    this.collectionsSignal.update((list) => list.map((x) => (x.id === id ? c : x)));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${API_URL}/me/collections/${id}`, { headers: this.headers() }),
    );
    this.collectionsSignal.update((list) => list.filter((x) => x.id !== id));
  }

  messageOf(err: unknown): string {
    const e = err as { error?: { error?: string }; status?: number };
    if (e?.error?.error) return e.error.error;
    if (e?.status === 401) return 'Please log in first.';
    if (e?.status === 0) return 'Cannot reach the server. Is `npm run server` running?';
    return 'Something went wrong. Please try again.';
  }
}
