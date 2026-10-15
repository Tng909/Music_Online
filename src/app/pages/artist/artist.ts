import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { QueueSource, formatCount } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { TrackList } from '../../components/track-list/track-list';

@Component({
  selector: 'app-artist',
  imports: [RouterLink, TrackList],
  templateUrl: './artist.html',
})
export class ArtistPage {
  player = inject(PlayerService);
  music = inject(MusicService);
  private route = inject(ActivatedRoute);

  artistId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  artist = computed(() => this.music.getArtist(this.artistId()));
  songs = computed(() => {
    const a = this.artist();
    return a ? this.music.songsByArtist(a) : [];
  });
  source = computed<QueueSource | null>(() => {
    const a = this.artist();
    return a ? { type: 'artist', id: a.id, name: a.name } : null;
  });
  listeners = computed(() => formatCount(this.artist()?.monthlyListeners));
  /** True while this artist is what the player is playing from. */
  playingHere = computed(
    () => this.player.isPlaying() && this.player.queueSource()?.id === this.artist()?.id,
  );

  constructor() {
    // Refresh so monthly listeners and play counts are current.
    void this.music.load();
  }

  playAll(): void {
    if (this.player.queueSource()?.id === this.artist()?.id && this.player.currentTrack()) {
      this.player.toggle();
      return;
    }
    const songs = this.songs();
    if (songs.length) this.player.playTrack(songs[0], songs, this.source());
  }
}
