import { Injectable, computed, signal } from '@angular/core';
import { Track } from '../data/music-data';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  readonly currentTrack = signal<Track | null>(null);
  readonly isPlaying = signal(false);
  readonly progress = signal(0); // seconds into current track
  readonly volume = signal(70);
  readonly isMuted = signal(false);
  readonly isShuffled = signal(false);
  readonly repeatMode = signal<'off' | 'all' | 'one'>('off');
  readonly likedIds = signal<Set<string>>(new Set(['t1', 't6']));

  private queue = signal<Track[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Real playback when the song has audioUrl (files in public/audio/). */
  private audio: HTMLAudioElement | null = null;
  private audioSrcKey: string | null = null;

  readonly hasTrack = computed(() => this.currentTrack() !== null);
  readonly progressPercent = computed(() => {
    const track = this.currentTrack();
    if (!track) return 0;
    return Math.min(100, (this.progress() / track.duration) * 100);
  });

  constructor() {
    this.startTicker();
    this.initMediaSession();
    this.syncMediaSession();
  }

  playTrack(track: Track, context: Track[] = []): void {
    if (context.length) this.queue.set(context);
    else if (!this.queue().length) this.queue.set([track]);
    this.currentTrack.set(track);
    this.progress.set(0);
    this.isPlaying.set(true);
    if (track.audioUrl && this.audioSrcKey !== track.audioUrl) {
      this.audioSrcKey = track.audioUrl;
      const a = this.ensureAudio();
      if (a) a.src = track.audioUrl;
    }
    this.applyAudioState();
    this.syncMediaSession();
  }

  toggle(): void {
    if (!this.currentTrack()) return;
    this.isPlaying.update((v) => !v);
    this.applyAudioState();
    this.syncMediaSession();
  }

  next(): void {
    const q = this.queue();
    const cur = this.currentTrack();
    if (!cur || !q.length) return;
    if (this.repeatMode() === 'one') {
      this.progress.set(0);
      return;
    }
    let idx = q.findIndex((x) => x.id === cur.id);
    if (this.isShuffled()) {
      idx = Math.floor(Math.random() * q.length);
    } else {
      idx = (idx + 1) % q.length;
    }
    this.playTrack(q[idx], q);
  }

  prev(): void {
    const q = this.queue();
    const cur = this.currentTrack();
    if (!cur) return;
    if (this.progress() > 3) {
      this.progress.set(0);
      return;
    }
    if (!q.length) return;
    const idx = q.findIndex((x) => x.id === cur.id);
    const prevIdx = (idx - 1 + q.length) % q.length;
    this.playTrack(q[prevIdx], q);
  }

  seekTo(seconds: number): void {
    const track = this.currentTrack();
    if (!track) return;
    const clamped = Math.max(0, Math.min(track.duration, seconds));
    this.progress.set(clamped);
    if (this.audio?.src) this.audio.currentTime = clamped;
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

      // Real audio file playing → follow its clock.
      if (this.audio?.src && !this.audio.paused && !this.audio.ended) {
        this.progress.set(this.audio.currentTime);
        return;
      }
      if (this.audio?.src && this.audio.ended) {
        this.next();
        return;
      }

      const next = this.progress() + 1;
      if (next >= track.duration) {
        if (this.repeatMode() === 'one') {
          this.progress.set(0);
          if (this.audio?.src) this.audio.currentTime = 0;
        } else {
          this.next();
        }
      } else {
        this.progress.set(next);
      }
    }, 1000);
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null; // non-browser (tests)
    if (!this.audio) this.audio = new Audio();
    return this.audio;
  }

  /** Sync the HTMLAudioElement with current signals (play/pause/volume). */
  private applyAudioState(): void {
    const track = this.currentTrack();
    const url = track?.audioUrl ?? null;
    if (!url) {
      if (this.audio) this.audio.pause();
      return;
    }
    const a = this.ensureAudio();
    if (!a) return;
    if (this.audioSrcKey !== url) {
      this.audioSrcKey = url;
      a.src = url;
    }
    a.volume = this.isMuted() ? 0 : this.volume() / 100;
    if (this.isPlaying()) {
      try {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch {
        /* jsdom / autoplay restrictions — simulated ticker takes over */
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
