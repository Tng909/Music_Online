import { Component, computed, inject, signal } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { formatTime } from '../../data/music-data';
import { BluetoothControl } from '../bluetooth-control/bluetooth-control';
import { DownloadService } from '../../services/download.service';

@Component({
  selector: 'app-playerbar',
  imports: [BluetoothControl],
  templateUrl: './playerbar.html',
})
export class Playerbar {
  player = inject(PlayerService);
  private music = inject(MusicService);
  downloads = inject(DownloadService);

  track = this.player.currentTrack;
  isPlaying = this.player.isPlaying;
  progress = this.player.progress;
  volume = this.player.volume;
  isMuted = this.player.isMuted;
  isShuffled = this.player.isShuffled;
  repeatMode = this.player.repeatMode;

  elapsed = computed(() => formatTime(this.scrubbing() ? this.scrubValue() : this.progress()));
  total = computed(() => formatTime(this.player.duration()));

  /** Volume fill shown on the right-side slider — white once the user moves it, dimmer at rest. */
  volumeFill = computed(() => {
    const pct = this.isMuted() ? 0 : this.volume();
    const filled = this.volumeTouched() ? '#fff' : 'rgba(255,255,255,0.7)';
    return `linear-gradient(to right, ${filled} ${pct}%, rgba(255,255,255,0.25) ${pct}%)`;
  });

  /** While dragging the progress bar, show the local preview, not the ticker. */
  scrubbing = signal(false);
  scrubValue = signal(0);
  /** Set the first time the user drags the volume slider. */
  volumeTouched = signal(false);

  /** Percent + fill shown on the slider (preview while scrubbing). */
  sliderPercent = computed(() => {
    const dur = this.player.duration();
    if (!dur) return 0;
    const pos = this.scrubbing() ? this.scrubValue() : this.progress();
    return Math.max(0, Math.min(100, (pos / dur) * 100));
  });
  sliderFill = computed(
    () => `linear-gradient(to right, #fff ${this.sliderPercent()}%, rgba(255,255,255,0.25) ${this.sliderPercent()}%)`,
  );
  seekLabel = computed(() => {
    const dur = this.player.duration();
    if (!dur) return 'Seek';
    const v = this.scrubbing() ? this.scrubValue() : this.progress();
    return `Seek to ${formatTime(v)} of ${formatTime(dur)}`;
  });

  repeatTitle = computed(() => {
    const m = this.repeatMode();
    return m === 'off' ? 'Repeat: off' : m === 'all' ? 'Repeat playlist' : 'Repeat one song';
  });

  constructor() {
    // Feed the live backend catalog to the radio fallback (runs forever
    // after the queue ends). Polling keeps this decoupled from load timing.
    const sync = (): void => {
      const songs = this.music.songs();
      if (songs.length) {
        this.player.setLibrary(songs);
        return;
      }
      setTimeout(sync, 1000);
    };
    sync();
  }

  onSeekStart(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (!this.track()) return;
    this.scrubbing.set(true);
    this.scrubValue.set(this.secondsFromSlider(el));
  }

  onSeeking(event: Event): void {
    if (!this.scrubbing()) return;
    this.scrubValue.set(this.secondsFromSlider(event.target as HTMLInputElement));
  }

  onSeekEnd(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (!this.scrubbing()) return;
    this.scrubbing.set(false);
    this.player.seekTo(this.secondsFromSlider(el));
  }

  private secondsFromSlider(el: HTMLInputElement): number {
    const dur = this.player.duration();
    const pct = Number(el.value);
    if (!dur || Number.isNaN(pct)) return 0;
    return (Math.max(0, Math.min(100, pct)) / 100) * dur;
  }

  onVolume(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.volumeTouched.set(true);
    this.player.setVolume(Number(el.value));
  }

  liked(): boolean {
    const id = this.track()?.id;
    return id ? this.player.isLiked(id) : false;
  }

  downloadable(): boolean {
    const t = this.track();
    return t ? this.downloads.canDownload(t) : false;
  }

  downloaded(): boolean {
    const id = this.track()?.id;
    return id ? this.downloads.isDownloaded(id) : false;
  }

  downloading(): boolean {
    const id = this.track()?.id;
    return id ? this.downloads.isDownloading(id) : false;
  }

  downloadCurrent(): void {
    const t = this.track();
    if (t) void this.downloads.download(t);
  }
}