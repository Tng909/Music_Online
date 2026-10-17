import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { MediaCard } from '../../components/media-card/media-card';
import { ArtistCard } from '../../components/artist-card/artist-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MediaCard, ArtistCard],
  templateUrl: './home.html',
})
export class Home {
  player = inject(PlayerService);
  music = inject(MusicService);

  greeting = signal(this.computeGreeting());

  /** Catalog playlists only — user-created ones live in each user's library. */
  playlists = computed(() => this.music.playlists().filter((p) => !p.ownerId));
  artists = computed(() =>
    [...this.music.artists()].sort((a, b) => (b.monthlyListeners ?? 0) - (a.monthlyListeners ?? 0)).slice(0, 12),
  );
  backendOk = this.music.backendOk;

  quickPicks = computed(() => this.playlists().slice(0, 6));
  topPlaylists = this.playlists;
  chartTracks = this.music.topSongs;
  currentId = this.player.currentTrack;

  private computeGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  playQuick(id: string): void {
    const pl = this.music.getPlaylist(id);
    if (pl?.tracks.length) this.player.playTrack(pl.tracks[0], pl.tracks, { type: 'playlist', id: pl.id, name: pl.title });
  }
}

