import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ARTISTS, PLAYLISTS, TRACKS } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MediaCard } from '../../components/media-card/media-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MediaCard],
  templateUrl: './home.html',
})
export class Home {
  player = inject(PlayerService);

  greeting = signal(this.computeGreeting());
  quickPicks = PLAYLISTS.slice(0, 6);
  madeForYou = PLAYLISTS.slice(2, 8);
  topPlaylists = PLAYLISTS;
  artists = ARTISTS;
  chartTracks = TRACKS.slice(0, 5);
  currentId = this.player.currentTrack;

  private computeGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  playQuick(id: string): void {
    const pl = PLAYLISTS.find((p) => p.id === id);
    if (pl?.tracks.length) this.player.playTrack(pl.tracks[0], pl.tracks);
  }
}
