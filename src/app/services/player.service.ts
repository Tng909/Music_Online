import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { QueueSource, Track, LyricLine } from '../data/music-data';

export type RepeatMode = 'off' | 'all' | 'one';

type StatsReporter = { reportPlay(id: string): void; heartbeat(id: string): void; stop(): void };

/** Root injector when created by Angular; null when constructed directly (unit tests). */
function currentInjector(): Injector | null {
  try {
    return inject(Injector);
  } catch {
    return null;
  }
}

const LIKED_STORAGE_KEY = 'music-online-liked-v1';

function loadLikedIds(fallback: string[]): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set(fallback);
    const raw = localStorage.getItem(LIKED_STORAGE_KEY);
    if (!raw) return new Set(fallback);
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set(fallback);
  } catch {
    return new Set(fallback);
  }
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  // Captured at construction: inject() only works synchronously in an injection
  // context, never inside the async import callback below.
  private injector = currentInjector();
  private stats: StatsReporter | null | undefined;
  private resolveStats(): StatsReporter | null {
    if (this.stats === undefined) {
      this.stats = null; // default: no reporting (tests, backend down)
      const injector = this.injector;
      if (!injector) return null;
      // Lazy-load so raw vitest never pulls HttpClient into the spec graph.
      void import('./stats.service')
        .then((m) => {
          this.stats = injector.get(m.StatsService, null);
          // Flush the play that triggered loading, then resume live reporting.
          const cur = this.currentTrack();
          if (cur && this.isPlaying()) this.stats?.reportPlay(cur.id);
          this.syncLive();
        })
        .catch(() => undefined);
    }
    return this.stats;
  }
  readonly currentTrack = signal<Track | null>(null);
  readonly isPlaying = signal(false);
  readonly progress = signal(0); // seconds into current track
  /** Synced lyrics of the current track (time-ordered). */
  readonly lyrics = computed(() => this.currentTrack()?.lyrics ?? null);
  /** The lyric line to show at the current playback position; null when nothing has started yet. */
  readonly currentLyricLine = computed<LyricLine | null>(() => {
    const lines = this.currentTrack()?.lyrics;
    if (!lines?.length) return null;
    const pos = this.progress();
    let current: LyricLine | null = null;
    for (const line of lines) {
      if (line.time <= pos) current = line;
      else break;
    }
    return current;
  });
  readonly volume = signal(70);
  readonly isMuted = signal(false);
  readonly isShuffled = signal(false);
  readonly repeatMode = signal<RepeatMode>('off');
  /** Liked song ids — persisted to localStorage, survives reload. */
  readonly likedIds = signal<Set<string>>(loadLikedIds([]));
  readonly likedCount = computed(() => this.likedIds().size);

  /**
   * Full catalog used for the radio fallback when the queue runs out.
   * Empty until the playerbar syncs the backend catalog in via setLibrary().
   */
  private library = signal<Track[]>([]);
  /** Real MP3 duration from metadata — null until loaded / for simulated tracks. */
  private realDuration = signal<number | null>(null);
  private queue = signal<Track[]>([]);
  /** Playlist / artist the queue was started from; null for anything else (search, radio…). */
  readonly queueSource = signal<QueueSource | null>(null);
  /** Pre-picked radio songs, so "Next up" shows exactly what plays after the queue. */
  private radioPlan = signal<Track[]>([]);
  /** Most recent first, current song included. */
  readonly recentlyPlayed = signal<Track[]>([]);
  /** Right-side queue panel visibility. */
  readonly queueOpen = signal(false);

  /** Songs left in the queue after the current one. */
  private queueRest = computed(() => {
    const q = this.queue();
    const idx = q.findIndex((t) => t.id === this.currentTrack()?.id);
    return idx === -1 ? [] : q.slice(idx + 1);
  });
  /** "Next from: <source>" — the rest of a playlist / artist queue. */
  readonly nextFromSource = computed(() => (this.queueSource() ? this.queueRest() : []));
  /** "Next up" — the rest of a source-less queue, then radio once it runs out. */
  readonly nextUp = computed(() => {
    const rest = this.queueRest();
    if (this.queueSource() && rest.length) return [];
    return [...(this.queueSource() ? [] : rest), ...this.radioPlan()];
  });
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
    if (tracks && tracks.length) {
      this.library.set(tracks);
      this.planRadio();
    }
  }

  toggleQueuePanel(): void {
    this.queueOpen.update((v) => !v);
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

  /** Start a song from the UI. `source` labels the queue ("Next from: …"). */
  playTrack(track: Track, context: Track[] = [], source: QueueSource | null = null): void {
    if (context.length) this.queue.set(context);
    else if (!this.queue().length) this.queue.set([track]);
    this.queueSource.set(context.length ? source : null);
    this.start(track);
  }

  /** Jump to a song listed in the queue panel. */
  playFromQueue(track: Track): void {
    if (this.queue().some((t) => t.id === track.id)) {
      this.start(track);
      return;
    }
    // A radio pick: it joins the queue, which no longer belongs to a source.
    this.queue.update((q) => [...q, track]);
    this.queueSource.set(null);
    this.start(track);
  }

  private start(track: Track): void {
    this.currentTrack.set(track);
    this.recentlyPlayed.update((list) => [track, ...list.filter((t) => t.id !== track.id)].slice(0, 30));
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
    this.planRadio();
  }

  /** Accurate play event + heartbeat (drives admin dashboard + live count). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private reportPlay(trackId: string): void {
    this.resolveStats()?.reportPlay(trackId);
    this.syncLive();
  }

  /**
   * Live presence: heartbeat while playing, explicit stop on pause, so the
   * dashboard counts only people actually listening (not merely online).
   */
  private syncLive(): void {
    const stats = this.resolveStats();
    if (!stats) return;
    if (this.isPlaying() && this.currentTrack()) {
      stats.heartbeat(this.currentTrack()!.id);
      if (!this.heartbeatTimer) {
        this.heartbeatTimer = setInterval(() => {
          const cur = this.currentTrack();
          if (this.isPlaying() && cur) this.resolveStats()?.heartbeat(cur.id);
        }, 10000);
      }
    } else {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      stats.stop();
    }
  }

  toggle(): void {
    if (!this.currentTrack()) return;
    this.isPlaying.update((v) => !v);
    this.applyAudioState();
    this.syncMediaSession();
    this.syncLive();
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
      if (this.repeatMode() === 'all') this.start(q[q.length - 1]);
      else this.restartCurrent();
      return;
    }
    this.start(q[idx - 1]);
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
      this.start(q[pick]);
      return;
    }
    const idx = q.findIndex((x) => x.id === cur.id);
    const atEnd = idx === -1 || idx === q.length - 1;
    if (!atEnd) {
      this.start(q[idx + 1]);
      return;
    }
    if (this.repeatMode() === 'all') {
      this.start(q[0]);
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

  /** Radio fallback: the next pre-planned library track (never the one just played). */
  private playRadio(excludeId: string | null): void {
    const pool = this.library();
    if (!pool.length) {
      this.isPlaying.set(false);
      this.applyAudioState();
      this.syncLive();
      return;
    }
    const planned = this.radioPlan().find((t) => t.id !== excludeId);
    const candidates = excludeId ? pool.filter((t) => t.id !== excludeId) : pool;
    const list = candidates.length ? candidates : pool;
    const pick = planned ?? list[Math.floor(Math.random() * list.length)];
    this.queue.update((q) => [...q, pick]);
    this.queueSource.set(null);
    this.start(pick);
  }

  /** Shuffle the library (minus what is playing or already queued) into the radio plan. */
  private planRadio(): void {
    const skip = new Set([this.currentTrack()?.id, ...this.queueRest().map((t) => t.id)]);
    const pool = this.library().filter((t) => !skip.has(t.id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.radioPlan.set(pool.slice(0, 10));
  }

  toggleLike(id: string): void {
    this.likedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage full / private mode — likes just won't survive reload */
      }
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
