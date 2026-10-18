import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { QueueSource } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { LibraryService } from '../../services/library.service';
import { TrackList } from '../../components/track-list/track-list';

@Component({
  selector: 'app-album',
  imports: [RouterLink, TrackList],
  templateUrl: './album.html',
})
export class AlbumPage {
  player = inject(PlayerService);
  music = inject(MusicService);
  library = inject(LibraryService);
  private route = inject(ActivatedRoute);

  albumId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  album = computed(() => this.music.getAlbum(this.albumId()));
  tracks = computed(() => this.album()?.tracks ?? []);
  source = computed<QueueSource | null>(() => {
    const al = this.album();
    return al ? { type: 'album', id: al.id, name: al.title } : null;
  });
  saved = computed(() => this.library.savedAlbumIds().has(this.albumId()));
  /** True while this album is what the player is playing from. */
  playingHere = computed(
    () => this.player.isPlaying() && this.player.queueSource()?.id === this.album()?.id,
  );

  constructor() {
    // Refresh so play counts are current.
    void this.music.load();
  }

  playAll(): void {
    if (this.player.queueSource()?.id === this.album()?.id && this.player.currentTrack()) {
      this.player.toggle();
      return;
    }
    const tracks = this.tracks();
    if (tracks.length) this.player.playTrack(tracks[0], tracks, this.source());
  }
}
