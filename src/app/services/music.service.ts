import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Artist, Playlist, Track, splitArtists } from '../data/music-data';

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

  private songsSignal = signal<Track[]>([]);
  private playlistsSignal = signal<Playlist[]>([]);
  private artistsSignal = signal<Artist[]>([]);
  private loadedSignal = signal(false);
  private backendOkSignal = signal(false);

  readonly songs = this.songsSignal.asReadonly();
  readonly playlists = this.playlistsSignal.asReadonly();
  readonly artists = this.artistsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly backendOk = this.backendOkSignal.asReadonly();

  /** Most played first (real play counts). */
  readonly topSongs = computed(() =>
    [...this.songsSignal()].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0)).slice(0, 10),
  );

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
      // Backend not running — nothing to show (no fake fallback catalog).
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

  getArtist(id: string): Artist | undefined {
    return this.artistsSignal().find((a) => a.id === id);
  }

  /** Each name credited on a song, with the artist page id when one exists. */
  artistLinks(credit: string): { name: string; id: string | null }[] {
    const byName = new Map(this.artistsSignal().map((a) => [a.name.toLowerCase(), a.id]));
    return splitArtists(credit).map((name) => ({ name, id: byName.get(name.toLowerCase()) ?? null }));
  }

  /** Songs an artist is linked to or credited on, in catalog order. */
  songsByArtist(artist: Artist): Track[] {
    const ids = new Set(artist.songIds ?? []);
    const name = artist.name.toLowerCase();
    return this.songsSignal().filter(
      (s) => ids.has(s.id) || splitArtists(s.artist).some((n) => n.toLowerCase() === name),
    );
  }
}
