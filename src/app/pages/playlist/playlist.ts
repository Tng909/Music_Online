import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { QueueSource } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { TrackList } from '../../components/track-list/track-list';

@Component({
  selector: 'app-playlist',
  imports: [RouterLink, TrackList],
  templateUrl: './playlist.html',
})
export class PlaylistPage {
  player = inject(PlayerService);
  music = inject(MusicService);
  private route = inject(ActivatedRoute);

  playlistId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  playlist = computed(() => this.music.getPlaylist(this.playlistId()));
  source = computed<QueueSource | null>(() => {
    const pl = this.playlist();
    return pl ? { type: 'playlist', id: pl.id, name: pl.title } : null;
  });
  /** True while this playlist is what the player is playing from. */
  playingHere = computed(
    () => this.player.isPlaying() && this.player.queueSource()?.id === this.playlist()?.id,
  );

  constructor() {
    // Refresh so play counts are current.
    void this.music.load();
  }

  playAll(): void {
    if (this.player.queueSource()?.id === this.playlist()?.id && this.player.currentTrack()) {
      this.player.toggle();
      return;
    }
    const pl = this.playlist();
    if (pl?.tracks.length) this.player.playTrack(pl.tracks[0], pl.tracks, this.source());
  }
}
