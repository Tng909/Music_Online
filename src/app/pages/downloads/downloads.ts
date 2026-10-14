import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatTime } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { DownloadService } from '../../services/download.service';

@Component({
  selector: 'app-downloads',
  imports: [RouterLink],
  templateUrl: './downloads.html',
})
export class Downloads {
  player = inject(PlayerService);
  music = inject(MusicService);
  downloads = inject(DownloadService);

  fmt = formatTime;
  currentId = computed(() => this.player.currentTrack()?.id);
  isPlaying = this.player.isPlaying;
  records = this.downloads.history;
  count = this.downloads.count;

  play(id: string): void {
    const rec = this.downloads.getRecord(id);
    if (!rec) return;
    const catalog = this.music.songs();
    const track = catalog.find((t) => t.id === id) ?? {
      id: rec.id,
      title: rec.title,
      artist: rec.artist,
      album: rec.album,
      duration: rec.duration,
      plays: rec.plays,
      gradient: rec.gradient,
      emoji: rec.emoji,
      coverUrl: rec.coverUrl,
      audioUrl: rec.audioUrl,
    };
    const context = catalog.some((t) => t.id === id)
      ? catalog
      : [...catalog.filter((t) => t.id !== id), track];
    this.player.playTrack(track, context);
  }

  redownload(event: MouseEvent, id: string): void {
    event.stopPropagation();
    void this.downloads.redownload(id);
  }

  remove(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.downloads.remove(id);
  }

  clearAll(): void {
    this.downloads.clear();
  }

  downloadedDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  }
}
