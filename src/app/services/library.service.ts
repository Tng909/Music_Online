import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL, MusicService } from './music.service';
import { AuthService } from './auth.service';

interface LibraryState {
  followedArtists: string[];
  savedPlaylists: string[];
  savedAlbums: string[];
}

/**
 * "Your Library" for the signed-in user: followed artists, saved / created
 * playlists (server/library.js). Signed out, the library is empty and
 * follow / save / create send the user to log in.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
  private music = inject(MusicService);

  readonly activeFilter = signal<'Playlists' | 'Artists' | 'Albums'>('Playlists');

  private state = signal<LibraryState>({ followedArtists: [], savedPlaylists: [], savedAlbums: [] });

  readonly followedIds = computed(() => new Set(this.state().followedArtists));
  readonly savedIds = computed(() => new Set(this.state().savedPlaylists));
  readonly savedAlbumIds = computed(() => new Set(this.state().savedAlbums ?? []));

  /** Albums the user added to Your Library, most recent first. */
  readonly albums = computed(() =>
    (this.state().savedAlbums ?? []).map((id) => this.music.getAlbum(id)).filter((a) => !!a),
  );

  /** Saved + created playlists, most recent first. */
  readonly playlists = computed(() =>
    this.state()
      .savedPlaylists.map((id) => this.music.getPlaylist(id))
      .filter((p) => !!p),
  );

  readonly artists = computed(() =>
    this.state()
      .followedArtists.map((id) => this.music.getArtist(id))
      .filter((a) => !!a),
  );

  constructor() {
    // Reload whenever the signed-in user changes (login / logout / restore).
    effect(() => {
      if (this.auth.user()) void this.load();
      else this.state.set({ followedArtists: [], savedPlaylists: [], savedAlbums: [] });
    });
  }

  setFilter(f: 'Playlists' | 'Artists' | 'Albums'): void {
    this.activeFilter.set(f);
  }

  isFollowing(artistId: string): boolean {
    return this.followedIds().has(artistId);
  }

  isSaved(playlistId: string): boolean {
    return this.savedIds().has(playlistId);
  }

  toggleFollow(artistId: string): Promise<void> {
    const on = this.isFollowing(artistId);
    return this.send(on ? 'DELETE' : 'PUT', `/artists/${encodeURIComponent(artistId)}`, true);
  }

  isAlbumSaved(albumId: string): boolean {
    return this.savedAlbumIds().has(albumId);
  }

  /** Add an album to Your Library, or remove it. */
  toggleSaveAlbum(albumId: string): Promise<void> {
    const on = this.isAlbumSaved(albumId);
    return this.send(on ? 'DELETE' : 'PUT', `/albums/${encodeURIComponent(albumId)}`);
  }

  toggleSave(playlistId: string): Promise<void> {
    const on = this.isSaved(playlistId);
    return this.send(on ? 'DELETE' : 'PUT', `/playlists/${encodeURIComponent(playlistId)}`);
  }

  /** Create an empty playlist and open it (or stay put when `open` is false). Resolves to its id. */
  async createPlaylist(open = true): Promise<string | null> {
    if (!this.requireLogin()) return null;
    const res = await firstValueFrom(
      this.http.post<LibraryState>(`${API_URL}/library/playlists`, {}, { headers: this.headers() }),
    );
    await this.music.load();
    this.state.set(res);
    this.activeFilter.set('Playlists');
    const id = res.savedPlaylists[0] ?? null;
    if (id && open) void this.router.navigate(['/playlist', id]);
    return id;
  }

  /** Playlists the signed-in user created, most recent first. */
  readonly ownPlaylists = computed(() => {
    const me = this.auth.user()?.id;
    return me ? this.music.playlists().filter((p) => p.ownerId === me) : [];
  });

  isOwner(playlistId: string): boolean {
    const me = this.auth.user()?.id;
    return !!me && this.music.getPlaylist(playlistId)?.ownerId === me;
  }

  addTrack(playlistId: string, songId: string): Promise<void> {
    return this.ownerSend('POST', `/${encodeURIComponent(playlistId)}/tracks`, { songId });
  }

  removeTrack(playlistId: string, songId: string): Promise<void> {
    return this.ownerSend('DELETE', `/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(songId)}`);
  }

  updatePlaylist(
    playlistId: string,
    changes: { title?: string; description?: string; coverUrl?: string | null; trackIds?: string[] },
  ): Promise<void> {
    return this.ownerSend('PATCH', `/${encodeURIComponent(playlistId)}`, changes);
  }

  /** Upload a cover image for one of the user's playlists; resolves to its `/covers/…` URL. */
  async uploadCover(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await firstValueFrom(
      this.http.post<{ url: string }>(`${API_URL}/library/uploads/cover`, form, { headers: this.headers() }),
    );
    return res.url;
  }

  /** Delete an owned playlist and leave its page. */
  async deletePlaylist(playlistId: string): Promise<void> {
    await this.ownerSend('DELETE', `/${encodeURIComponent(playlistId)}`);
    void this.router.navigate(['/']);
  }

  /** Change one of the user's own playlists, then reload the catalog so pages show it. */
  private async ownerSend(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: object): Promise<void> {
    if (!this.requireLogin()) return;
    const res = await firstValueFrom(
      this.http.request<LibraryState>(method, `${API_URL}/library/my-playlists${path}`, {
        body,
        headers: this.headers(),
      }),
    );
    this.state.set(res);
    await this.music.load();
  }

  private async load(): Promise<void> {
    try {
      this.state.set(
        await firstValueFrom(this.http.get<LibraryState>(`${API_URL}/library`, { headers: this.headers() })),
      );
    } catch {
      // Server offline or session expired — keep the empty library.
    }
  }

  private async send(method: 'PUT' | 'DELETE', path: string, refreshArtists = false): Promise<void> {
    if (!this.requireLogin()) return;
    const res = await firstValueFrom(
      this.http.request<LibraryState>(method, `${API_URL}/library${path}`, { headers: this.headers() }),
    );
    this.state.set(res);
    // Follower counts are computed by the backend.
    if (refreshArtists) void this.music.load();
  }

  requireLogin(): boolean {
    if (this.auth.loggedIn()) return true;
    void this.router.navigate(['/login']);
    return false;
  }

  private headers(): Record<string, string> {
    const t = localStorage.getItem('music_online_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}
