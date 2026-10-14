import { Injectable, computed, signal } from '@angular/core';
import { TRACKS, Track } from '../data/music-data';

export type RepeatMode = 'off' | 'all' | 'one';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private stats: { reportPlay(id: string): void; heartbeat(id: string): void } | null | undefined;
  private resolveStats(): { reportPlay(id: string): void; heartbeat(id: string): void } | null {
    if (this.stats === undefined) {
      this.stats = null; // default: no reporting (tests, backend down)
      // Lazy-load so raw vitest never pulls HttpClient into the spec graph.
      void import('./stats.service')
        .then(async (m) => {
          const { inject } = await import('@angular/core');
          try {
            this.stats = inject(m.StatsService, { optional: true }) ?? null;
          } catch {
            this.stats = null;
          }
        })
        .catch(() => undefined);
    }
    return this.stats;
  }
  readonly currentTrack = signal<Track | null>(null);
  readonly isPlaying = signal(false);
  readonly progress = signal(0); // seconds into current track
  readonly volume = signal(70);
  readonly isMuted = signal(false);
  readonly isShuffled = signal(false);
  readonly repeatMode = signal<RepeatMode>('off');
  readonly likedIds = signal<Set<string>>(new Set(['t1', 't6']));

  /**
   * Full catalog used for the radio fallback when the queue runs out.
   * Defaults to the bundled seed; the playerbar syncs the live
   * backend catalog in via setLibrary() once it loads.
   */
  private library = signal<Track[]>(TRACKS);
  /** Real MP3 duration from metadata — null until loaded / for simulated tracks. */
  private realDuration = signal<number | null>(null);
  private queue = signal<Track[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Real playback when the song has audioUrl (files in public/audio/). */
  private audio: HTMLAudioElement | null = null;
  private audioSrcKey: string | null = null;

  readonly hasTrack = computed(() => this.currentTrack() !== null);
  /** Real duration when known, else the track's listed duration. */
  readonly duration = computed(() => {
    const real = this.realDuration();
    if (real !== null && Number.isFinite(real) && real > 0) return real;
    return this.currentTrack()?.duration ?? 0;
  });
  readonly progressPercent = computed(() => {
    const dur = this.duration();
    if (!dur) return 0;
    return Math.min(100, (this.progress() / dur) * 100);
  });

  constructor() {
    this.startTicker();
    this.initMediaSession();
    this.syncMediaSession();
  }

  setLibrary(tracks: Track[]): void {
    if (tracks && tracks.length) this.library.set(tracks);
  }

  /** Stop the fallback ticker + audio (used in tests / teardown). */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.audio) this.audio.pause();
  }

  playTrack(track: Track, context: Track[] = []): void {
    if (context.length) this.queue.set(context);
    else if (!this.queue().length) this.queue.set([track]);
    this.currentTrack.set(track);
    this.progress.set(0);
    this.realDuration.set(null);
    this.isPlaying.set(true);
    if (track.audioUrl) {
      const url = encodeURI(track.audioUrl);
      if (this.audioSrcKey !== url) {
        this.audioSrcKey = url;
        const a = this.ensureAudio();
        if (a) {
          a.src = url;
          try {
            a.load();
          } catch {
            /* not ready — applyAudioState retries */
          }
        }
      }
    }
    this.applyAudioState();
    this.syncMediaSession();
    this.reportPlay(track.id);
  }

  /** Accurate play event + heartbeat (drives admin dashboard + live count). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private reportPlay(trackId: string): void {
    this.resolveStats()?.reportPlay(trackId);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.isPlaying()) return;
      const cur = this.currentTrack();
      if (!cur) return;
      this.resolveStats()?.heartbeat(cur.id);
    }, 15000);
  }

  toggle(): void {
    if (!this.currentTrack()) return;
    this.isPlaying.update((v) => !v);
    this.applyAudioState();
    this.syncMediaSession();
  }

  /** Manual next — always advances (repeat-one only affects auto-advance). */
  next(): void {
    this.advance(false);
  }

  prev(): void {
    const q = this.queue();
    const cur = this.currentTrack();
    if (!cur) return;
    // More than 3s in → restart the song (and the real audio element).
    if (this.progress() > 3) {
      this.restartCurrent();
      return;
    }
    if (!q.length) return;
    const idx = q.findIndex((x) => x.id === cur.id);
    if (idx <= 0) {
      if (this.repeatMode() === 'all') this.playTrack(q[q.length - 1], q);
      else this.restartCurrent();
      return;
    }
    this.playTrack(q[idx - 1], q);
  }

  /** Called when a track plays to the end (audio `ended` event or ticker). */
  handleTrackEnd(): void {
    this.advance(true);
  }

  seekTo(seconds: number): void {
    const dur = this.duration();
    if (!dur) return;
    const clamped = Math.max(0, Math.min(dur, seconds));
    this.progress.set(clamped);
    if (this.audio && this.audioSrcKey) {
      try {
        this.audio.currentTime = clamped;
      } catch {
        /* element not ready */
      }
    }
  }

  setVolume(v: number): void {
    this.volume.set(Math.max(0, Math.min(100, v)));
    if (v > 0) this.isMuted.set(false);
    this.applyAudioState();
  }

  toggleMute(): void {
    this.isMuted.update((v) => !v);
    this.applyAudioState();
  }

  toggleShuffle(): void {
    this.isShuffled.update((v) => !v);
  }

  cycleRepeat(): void {
    const order: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    const next = order[(order.indexOf(this.repeatMode()) + 1) % order.length];
    this.repeatMode.set(next);
  }

  /**
   * Shared step logic.
   * - auto=false (next button): always moves (repeat-one does NOT trap the button).
   * - auto=true (track ended): repeat-one restarts; repeat-all loops the queue;
   *   repeat-off plays a random song from the library (radio, forever).
   */
  private advance(auto: boolean): void {
    const q = this.queue();
    const cur = this.currentTrack();
    if (!cur || !q.length) return;
    if (auto && this.repeatMode() === 'one') {
      this.restartCurrent();
      return;
    }
    if (this.isShuffled()) {
      if (q.length === 1) {
        if (this.repeatMode() === 'all') {
          this.restartCurrent();
          return;
        }
        this.playRadio(cur.id);
        return;
      }
      let pick = Math.floor(Math.random() * q.length);
      if (q[pick].id === cur.id) pick = (pick + 1) % q.length;
      this.playTrack(q[pick], q);
      return;
    }
    const idx = q.findIndex((x) => x.id === cur.id);
    const atEnd = idx === -1 || idx === q.length - 1;
    if (!atEnd) {
      this.playTrack(q[idx + 1], q);
      return;
    }
    if (this.repeatMode() === 'all') {
      this.playTrack(q[0], q);
      return;
    }
    // Queue exhausted → radio: random song from the database, forever.
    this.playRadio(cur.id);
  }

  /** Restart the current song from 0 (keeps paused state as-is). */
  private restartCurrent(): void {
    this.progress.set(0);
    if (this.audio && this.audioSrcKey) {
      try {
        this.audio.currentTime = 0;
      } catch {
        /* element not ready */
      }
    }
    this.applyAudioState();
  }

  /** Radio fallback: random library track (never the one just played). */
  private playRadio(excludeId: string | null): void {
    const pool = this.library().length ? this.library() : TRACKS;
    const candidates = excludeId ? pool.filter((t) => t.id !== excludeId) : pool;
    const list = candidates.length ? candidates : pool;
    const pick = list[Math.floor(Math.random() * list.length)];
    this.playTrack(pick, [...this.queue(), pick]);
  }

  toggleLike(id: string): void {
    this.likedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isLiked(id: string): boolean {
    return this.likedIds().has(id);
  }

  private startTicker(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.isPlaying()) return;
      const track = this.currentTrack();
      if (!track) return;
      // Real audio files drive progress via timeupdate/ended events.
      if (track.audioUrl) return;
      // Simulated tracks (no audio file): advance the clock manually.
      const next = this.progress() + 1;
      if (next >= this.duration()) this.advance(true);
      else this.progress.set(next);
    }, 1000);
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null; // non-browser (tests)
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.addEventListener('timeupdate', () => {
        if (this.audio) this.progress.set(this.audio.currentTime);
      });
      this.audio.addEventListener('loadedmetadata', () => {
        const d = this.audio?.duration;
        if (typeof d === 'number' && Number.isFinite(d) && d > 0) this.realDuration.set(d);
      });
      this.audio.addEventListener('ended', () => this.advance(true));
      this.audio.addEventListener('error', () => {
        // Broken file (e.g. missing mp3) — skip instead of stalling.
        if (this.isPlaying()) this.advance(true);
      });
    }
    return this.audio;
  }

  /** Sync the HTMLAudioElement with current signals (play/pause/volume). */
  private applyAudioState(): void {
    const track = this.currentTrack();
    const url = track?.audioUrl ? encodeURI(track.audioUrl) : null;
    if (!url) {
      if (this.audio) this.audio.pause();
      return;
    }
    const a = this.ensureAudio();
    if (!a) return;
    if (this.audioSrcKey !== url) {
      this.audioSrcKey = url;
      a.src = url;
      try {
        a.load();
      } catch {
        /* ignore */
      }
    }
    a.volume = this.isMuted() ? 0 : this.volume() / 100;
    if (this.isPlaying()) {
      try {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch {
        /* jsdom / autoplay restrictions — events/ticker take over */
      }
    } else {
      a.pause();
    }
  }

  // ---------------------------------------------------------------------------
  // Media Session — hardware media keys / Bluetooth earbuds (AVRCP), lock-screen
  // and notification controls. The OS routes earbud button presses here, so
  // play/pause/next/prev on earbuds like the Redmi Buds 6 Play drive the player
  // without any GATT pairing. Degrades to a no-op where unsupported (tests/SSR).
  // ---------------------------------------------------------------------------

  private initMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    ms.setActionHandler('play', () => {
      if (!this.isPlaying()) this.toggle();
    });
    ms.setActionHandler('pause', () => {
      if (this.isPlaying()) this.toggle();
    });
    ms.setActionHandler('stop', () => {
      if (this.isPlaying()) this.toggle();
    });
    ms.setActionHandler('nexttrack', () => this.next());
    ms.setActionHandler('previoustrack', () => this.prev());
    ms.setActionHandler('seekbackward', (details) =>
      this.seekTo(this.progress() - (details.seekOffset ?? 10))
    );
    ms.setActionHandler('seekforward', (details) =>
      this.seekTo(this.progress() + (details.seekOffset ?? 10))
    );
    ms.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) this.seekTo(details.seekTime);
    });
  }

  /** Push current track + playback state to the OS media controls. */
  private syncMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.playbackState = this.isPlaying() ? 'playing' : 'paused';

    const track = this.currentTrack();
    if (track && typeof MediaMetadata !== 'undefined') {
      const artwork = track.coverUrl
        ? [
            {
              src: new URL(track.coverUrl, window.location.href).href,
              sizes: '512x512',
              type: 'image/jpeg',
            },
          ]
        : [];
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork,
      });
    }
  }
}
