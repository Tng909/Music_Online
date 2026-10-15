import { Injectable, computed, signal } from '@angular/core';
import type { Track } from '../data/music-data';

/** A record of one song the user downloaded to their device. */
export interface DownloadRecord {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  /** Play count when saved (older records stored a display string). */
  plays?: number | string;
  gradient: string;
  emoji: string;
  coverUrl?: string | null;
  audioUrl?: string | null;
  /** ISO timestamp of when the file was saved. */
  downloadedAt: string;
}

export const DOWNLOAD_STORAGE_KEY = 'music-online-downloads-v1';

function loadHistory(): DownloadRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(DOWNLOAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DownloadRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Keep filenames safe for Windows/macOS/Linux filesystems. */
export function downloadFileName(track: Pick<Track, 'title' | 'artist'>): string {
  const base = `${track.artist} - ${track.title}`
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'song'}.mp3`;
}

/**
 * Browser file downloads + download-history record.
 *
 * Clicking download fetches the song's `audioUrl`, saves it via a
 * temporary `<a download>` element so it lands in the user's OS
 * Downloads folder, and appends a record (persisted to localStorage)
 * that the Downloads page manages.
 *
 * Tracks without an `audioUrl` (simulated seed tracks) cannot be
 * downloaded — callers should hide/disable the button via canDownload().
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private historySignal = signal<DownloadRecord[]>(loadHistory());
  private downloadingSignal = signal<Set<string>>(new Set());
  private errorSignal = signal<string | null>(null);

  readonly history = this.historySignal.asReadonly();
  readonly downloadingIds = this.downloadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly count = computed(() => this.historySignal().length);

  /** Real file available -> the anchor download can work. */
  canDownload(track: Pick<Track, 'audioUrl'>): boolean {
    return !!track.audioUrl;
  }

  isDownloaded(id: string): boolean {
    return this.historySignal().some((r) => r.id === id);
  }

  isDownloading(id: string): boolean {
    return this.downloadingSignal().has(id);
  }

  getRecord(id: string): DownloadRecord | undefined {
    return this.historySignal().find((r) => r.id === id);
  }

  /** Save the song's MP3 to the user's device and record it in history. */
  async download(track: Track): Promise<boolean> {
    if (!track.audioUrl) {
      this.errorSignal.set(`No audio file available for "${track.title}".`);
      return false;
    }
    if (this.downloadingSignal().has(track.id)) return false;
    this.errorSignal.set(null);
    this.downloadingSignal.update((set) => new Set(set).add(track.id));
    try {
      const res = await fetch(encodeURI(track.audioUrl));
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName(track);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking right after click() can cancel the save in Firefox / Safari.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.record(track);
      return true;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Download failed.');
      return false;
    } finally {
      this.downloadingSignal.update((set) => {
        const next = new Set(set);
        next.delete(track.id);
        return next;
      });
    }
  }

  /** Re-trigger the file save for a previously downloaded song. */
  async redownload(id: string): Promise<boolean> {
    const record = this.getRecord(id);
    if (!record?.audioUrl) {
      this.errorSignal.set('No audio file available for this song.');
      return false;
    }
    return this.download({
      id: record.id,
      title: record.title,
      artist: record.artist,
      album: record.album,
      duration: record.duration,
      plays: typeof record.plays === 'number' ? record.plays : 0,
      gradient: record.gradient,
      emoji: record.emoji,
      coverUrl: record.coverUrl,
      audioUrl: record.audioUrl,
    });
  }

  /** Remove one entry from the history record (keeps the OS file). */
  remove(id: string): void {
    this.historySignal.update((list) => list.filter((r) => r.id !== id));
    this.persist();
  }

  /** Clear the whole download-history record (keeps OS files). */
  clear(): void {
    this.historySignal.set([]);
    this.persist();
  }

  /** Test seam — reset in-memory + persisted history. */
  resetForTests(): void {
    this.historySignal.set([]);
    this.downloadingSignal.set(new Set());
    this.errorSignal.set(null);
    try {
      localStorage.removeItem(DOWNLOAD_STORAGE_KEY);
    } catch {
      /* non-browser env */
    }
  }

  private record(track: Track): void {
    const entry: DownloadRecord = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      plays: track.plays,
      gradient: track.gradient,
      emoji: track.emoji,
      coverUrl: track.coverUrl ?? null,
      audioUrl: track.audioUrl ?? null,
      downloadedAt: new Date().toISOString(),
    };
    this.historySignal.update((list) => {
      const rest = list.filter((r) => r.id !== track.id);
      return [entry, ...rest];
    });
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify(this.historySignal()));
    } catch {
      /* storage full / private mode — history just won't survive reload */
    }
  }
}
