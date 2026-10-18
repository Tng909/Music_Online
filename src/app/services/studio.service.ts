import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './music.service';
import { Artist, Track } from '../data/music-data';

export interface StudioData {
  artist: Artist;
  songs: Track[];
}

export interface StudioSongBody {
  title: string;
  /** Featured artists; the signed-in artist is always credited first. */
  featured: string[];
  /** Empty: the song is its own single (album = title). */
  album: string;
  duration: number;
  coverUrl: string | null;
  audioUrl: string | null;
}

/** JSON part of an album-folder upload; numbers are indexes into the files sent with it. */
export interface AlbumFolderManifest {
  album: string;
  cover: number | null;
  songs: Array<{ title: string; audio: number; cover: number | null; duration: number }>;
  existingSongIds: string[];
}

/** An album = the songs sharing one `album` name (one song is enough). */
export interface StudioAlbum {
  name: string;
  songs: Track[];
  coverUrl: string | null;
}

/** Artist studio API (server/studio.js): an artist's own songs and albums. */
@Injectable({ providedIn: 'root' })
export class StudioService {
  private http = inject(HttpClient);

  me(): Promise<StudioData> {
    return firstValueFrom(this.http.get<StudioData>(`${API_URL}/studio/me`, { headers: this.headers() }));
  }

  /** New song; picked cover / song files go up in the same request. */
  createSong(body: StudioSongBody, files: SongFiles = {}): Promise<Track> {
    return firstValueFrom(
      this.http.post<Track>(`${API_URL}/studio/songs`, songForm(body, files), { headers: this.headers() }),
    );
  }

  updateSong(id: string, body: Partial<StudioSongBody>, files: SongFiles = {}): Promise<Track> {
    return firstValueFrom(
      this.http.put<Track>(`${API_URL}/studio/songs/${encodeURIComponent(id)}`, songForm(body, files), {
        headers: this.headers(),
      }),
    );
  }

  deleteSong(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API_URL}/studio/songs/${encodeURIComponent(id)}`, { headers: this.headers() }),
    );
  }

  /** Create (no `oldName`) or edit an album. */
  saveAlbum(name: string, songIds: string[], oldName?: string): Promise<StudioData> {
    return firstValueFrom(
      this.http.put<StudioData>(`${API_URL}/studio/albums`, { name, songIds, oldName }, { headers: this.headers() }),
    );
  }

  /** Album from a folder: every file plus the manifest in one request (the server creates the songs). */
  createAlbumFromFolder(manifest: AlbumFolderManifest, files: File[]): Promise<StudioData> {
    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest));
    for (const f of files) form.append('files', f, f.name);
    return firstValueFrom(
      this.http.post<StudioData>(`${API_URL}/studio/albums/folder`, form, { headers: this.headers() }),
    );
  }

  /** Remove an album; its songs become singles again. */
  deleteAlbum(name: string): Promise<StudioData> {
    return firstValueFrom(
      this.http.delete<StudioData>(`${API_URL}/studio/albums/${encodeURIComponent(name)}`, { headers: this.headers() }),
    );
  }

  messageOf(err: unknown): string {
    const e = err as { error?: { error?: string }; status?: number };
    if (e?.error?.error) return e.error.error;
    if (e?.status === 0) return 'Cannot reach the server. Is `npm run server` running?';
    if (e?.status === 403) return 'Artist account required.';
    return 'Something went wrong. Please try again.';
  }

  private headers(): Record<string, string> {
    const t = localStorage.getItem('music_online_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}

/** Files picked in the song form, sent with it on save. */
export interface SongFiles {
  cover?: File | null;
  audio?: File | null;
}

/** Song fields as multipart text (featured as JSON) plus the picked files. */
function songForm(body: Partial<StudioSongBody>, files: SongFiles): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (key === 'featured') form.append(key, JSON.stringify(value));
    else if (value !== null) form.append(key, String(value));
  }
  if (files.cover) form.append('cover', files.cover, files.cover.name);
  if (files.audio) form.append('audio', files.audio, files.audio.name);
  return form;
}

/** Group songs into albums by name (case-insensitive), biggest first. */
export function albumsOf(songs: Track[]): StudioAlbum[] {
  const map = new Map<string, StudioAlbum>();
  for (const s of songs) {
    const name = (s.album || s.title).trim();
    const key = name.toLowerCase();
    const album = map.get(key) ?? { name, songs: [], coverUrl: null };
    album.songs.push(s);
    // An album folder's cover wins over the first song's own cover.
    if (s.albumCoverUrl) album.coverUrl = s.albumCoverUrl;
    else album.coverUrl ??= s.coverUrl ?? null;
    map.set(key, album);
  }
  return [...map.values()].sort((a, b) => b.songs.length - a.songs.length || a.name.localeCompare(b.name));
}
