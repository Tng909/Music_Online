import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Artist, Playlist, TRACKS, PLAYLISTS, ARTISTS, Track } from '../data/music-data';

/** Base URL of the Express API (server/index.js). */
export const API_URL = 'http://localhost:3000/api';

/**
 * Loads songs / playlists / artists from the JSON-file database
 * served by the backend (server/data/database.json).
 *
 * If the backend is not running, it falls back to the bundled seed data
 * in src/app/data/music-data.ts so the UI still works.
 */
@Injectable({ providedIn: 'root' })
export class MusicService {
  private http = inject(HttpClient);

  private songsSignal = signal<Track[]>(TRACKS);
  private playlistsSignal = signal<Playlist[]>(PLAYLISTS);
  private artistsSignal = signal<Artist[]>(ARTISTS);
  private loadedSignal = signal(false);
  private backendOkSignal = signal(false);

  readonly songs = this.songsSignal.asReadonly();
  readonly playlists = this.playlistsSignal.asReadonly();
  readonly artists = this.artistsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly backendOk = this.backendOkSignal.asReadonly();

  readonly topSongs = computed(() => this.songsSignal().slice(0, 5));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const [songs, playlists, artists] = await Promise.all([
        firstValueFrom(this.http.get<Track[]>(`${API_URL}/songs`)),
        firstValueFrom(this.http.get<Playlist[]>(`${API_URL}/playlists`)),
        firstValueFrom(this.http.get<Artist[]>(`${API_URL}/artists`)),
      ]);
      this.songsSignal.set(songs);
      this.playlistsSignal.set(playlists);
      this.artistsSignal.set(artists);
      this.backendOkSignal.set(true);
    } catch {
      // Backend not running — keep bundled seed data (frontend still usable).
      this.backendOkSignal.set(false);
    } finally {
      this.loadedSignal.set(true);
    }
  }

  getSong(id: string): Track | undefined {
    return this.songsSignal().find((s) => s.id === id);
  }

  getPlaylist(id: string): Playlist | undefined {
    return this.playlistsSignal().find((p) => p.id === id);
  }
}
