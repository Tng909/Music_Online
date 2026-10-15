import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Artist, formatCount } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';

/** Round artist card: opens the artist page, the play button plays their songs. */
@Component({
  selector: 'app-artist-card',
  imports: [RouterLink],
  template: `
    <a [routerLink]="['/artist', artist().id]"
      class="group/card bg-transparent hover:bg-[#181818] transition-colors rounded-lg p-4 flex flex-col gap-3 cursor-pointer">
      <div class="relative">
        @if (artist().coverUrl; as url) {
          <img [src]="url" [alt]="artist().name" class="aspect-square w-full rounded-full object-cover shadow-lg" />
        } @else {
          <div [class]="'aspect-square w-full rounded-full flex items-center justify-center text-5xl bg-gradient-to-br shadow-lg ' + artist().gradient">
            {{ artist().emoji }}
          </div>
        }
        <button (click)="play($event)" title="Play artist"
          class="play-btn absolute bottom-2 right-2 w-12 h-12 rounded-full bg-[#1ed760] text-black flex items-center justify-center shadow-xl hover:scale-105">
          <svg viewBox="0 0 24 24" class="w-6 h-6 translate-x-[1px]" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
        </button>
      </div>
      <div>
        <p class="text-[15px] font-bold text-white truncate hover:underline">{{ artist().name }}</p>
        <p class="text-sm text-[#b3b3b3]">Artist • {{ listeners() }} monthly</p>
      </div>
    </a>
  `,
})
export class ArtistCard {
  private player = inject(PlayerService);
  private music = inject(MusicService);

  artist = input.required<Artist>();
  listeners = computed(() => formatCount(this.artist().monthlyListeners));

  play(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const a = this.artist();
    const songs = this.music.songsByArtist(a);
    if (songs.length) this.player.playTrack(songs[0], songs, { type: 'artist', id: a.id, name: a.name });
  }
}
