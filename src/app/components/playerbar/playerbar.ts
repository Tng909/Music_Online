import { Component, computed, inject } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { formatTime } from '../../data/music-data';

@Component({
  selector: 'app-playerbar',
  templateUrl: './playerbar.html',
})
export class Playerbar {
  player = inject(PlayerService);

  track = this.player.currentTrack;
  isPlaying = this.player.isPlaying;
  progress = this.player.progress;
  volume = this.player.volume;
  isMuted = this.player.isMuted;
  isShuffled = this.player.isShuffled;
  repeatMode = this.player.repeatMode;

  elapsed = computed(() => formatTime(this.progress()));
  total = computed(() => formatTime(this.track()?.duration ?? 0));

  onSeek(event: Event): void {
    const el = event.target as HTMLInputElement;
    const track = this.track();
    if (!track) return;
    const pct = Number(el.value);
    this.player.seekTo((pct / 100) * track.duration);
  }

  onVolume(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.player.setVolume(Number(el.value));
  }

  liked(): boolean {
    const id = this.track()?.id;
    return id ? this.player.isLiked(id) : false;
  }
}
