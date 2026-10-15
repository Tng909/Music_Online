import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount, formatTime, Track } from '../../data/music-data';
import { ArtistLinks } from '../../components/artist-links/artist-links';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { DownloadService } from '../../services/download.service';

@Component({
  selector: 'app-liked',
  imports: [RouterLink, ArtistLinks],
  templateUrl: './liked.html',
})
export class Liked {
  player = inject(PlayerService);
  music = inject(MusicService);
  downloads = inject(DownloadService);

  fmt = formatTime;
  count = formatCount;
  currentId = computed(() => this.player.currentTrack()?.id);
  isPlaying = this.player.isPlaying;

  /** Songs the user hearted, in catalog order. */
  tracks = computed(() => {
    const liked = this.player.likedIds();
    return this.music.songs().filter((t) => liked.has(t.id));
  });

  playAll(): void {
    const list = this.tracks();
    if (list.length) this.player.playTrack(list[0], list);
  }

  playTrack(id: string): void {
    const list = this.tracks();
    const track = list.find((t) => t.id === id);
    if (track) this.player.playTrack(track, list);
  }

  toggleLike(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.player.toggleLike(id);
  }

  isLiked(id: string): boolean {
    return this.player.isLiked(id);
  }

  downloadTrack(event: MouseEvent, track: Track): void {
    event.stopPropagation();
    void this.downloads.download(track);
  }
}
