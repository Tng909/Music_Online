import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { PLAYLISTS, formatTime } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';

@Component({
  selector: 'app-playlist',
  imports: [RouterLink],
  templateUrl: './playlist.html',
})
export class PlaylistPage {
  player = inject(PlayerService);
  private route = inject(ActivatedRoute);

  playlistId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  playlist = computed(() => PLAYLISTS.find((p) => p.id === this.playlistId()));
  currentId = computed(() => this.player.currentTrack()?.id);
  isPlaying = this.player.isPlaying;
  fmt = formatTime;

  playAll(): void {
    const pl = this.playlist();
    if (pl?.tracks.length) this.player.playTrack(pl.tracks[0], pl.tracks);
  }

  playTrack(id: string): void {
    const pl = this.playlist();
    const track = pl?.tracks.find((t) => t.id === id);
    if (track && pl) this.player.playTrack(track, pl.tracks);
  }
}
