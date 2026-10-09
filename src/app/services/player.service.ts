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

  readonly hasTrack = computed(() => this.currentTrack() !== null);
  readonly progressPercent = computed(() => {
    const track = this.currentTrack();
    if (!track) return 0;
    return Math.min(100, (this.progress() / track.duration) * 100);
  });

  constructor() {
    this.startTicker();
  }

  playTrack(track: Track, context: Track[] = []): void {
    if (context.length) this.queue.set(context);
    else if (!this.queue().length) this.queue.set([track]);
    this.currentTrack.set(track);
    this.progress.set(0);
    this.isPlaying.set(true);
  }

  toggle(): void {
    if (!this.currentTrack()) return;
    this.isPlaying.update((v) => !v);
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
    this.currentTrack.set(q[idx]);
    this.progress.set(0);
    this.isPlaying.set(true);
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
    this.currentTrack.set(q[prevIdx]);
    this.progress.set(0);
    this.isPlaying.set(true);
  }

  seekTo(seconds: number): void {
    const track = this.currentTrack();
    if (!track) return;
    this.progress.set(Math.max(0, Math.min(track.duration, seconds)));
  }

  setVolume(v: number): void {
    this.volume.set(Math.max(0, Math.min(100, v)));
    if (v > 0) this.isMuted.set(false);
  }

  toggleMute(): void {
    this.isMuted.update((v) => !v);
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
      const next = this.progress() + 1;
      if (next >= track.duration) {
        if (this.repeatMode() === 'one') {
          this.progress.set(0);
        } else {
          this.next();
        }
      } else {
        this.progress.set(next);
      }
    }, 1000);
  }
}
