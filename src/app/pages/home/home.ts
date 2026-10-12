import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { MediaCard } from '../../components/media-card/media-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MediaCard],
  templateUrl: './home.html',
})
export class Home {
  player = inject(PlayerService);
  music = inject(MusicService);

  greeting = signal(this.computeGreeting());

  playlists = this.music.playlists;
  artists = this.music.artists;
  backendOk = this.music.backendOk;

  quickPicks = computed(() => this.playlists().slice(0, 6));
  madeForYou = computed(() => this.playlists().slice(2, 8));
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
    if (pl?.tracks.length) this.player.playTrack(pl.tracks[0], pl.tracks);
  }
}

