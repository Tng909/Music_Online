import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Playlist, Track } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';

@Component({
  selector: 'app-media-card',
  imports: [RouterLink],
  templateUrl: './media-card.html',
})
export class MediaCard {
  player = inject(PlayerService);

  @Input({ required: true }) item!: Playlist | Track;
  @Input() kind: 'playlist' | 'track' = 'playlist';
  @Input() context: Track[] = [];
  @Input() round = false;

  get link(): string[] {
    if (this.kind === 'playlist') return ['/playlist', (this.item as Playlist).id];
    return ['/'];
  }

  get subtitle(): string {
    if (this.kind === 'playlist') return (this.item as Playlist).description;
    const t = this.item as Track;
    return `${t.artist} • ${t.album}`;
  }

  get title(): string {
    return (this.item as Playlist).title ?? (this.item as Track).title;
  }

  play(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.kind === 'track') {
      this.player.playTrack(this.item as Track, this.context.length ? this.context : [this.item as Track]);
    } else {
      const tracks = (this.item as Playlist).tracks;
      if (tracks.length) this.player.playTrack(tracks[0], tracks);
    }
  }
}
