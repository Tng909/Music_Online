import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Album } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';

/** Square album card: opens the album page, the play button plays its songs. */
@Component({
  selector: 'app-album-card',
  imports: [RouterLink],
  template: `
    <a [routerLink]="['/album', album().id]"
      class="group/card bg-[#181818] hover:bg-[#282828] transition-colors rounded-lg p-4 flex flex-col gap-3 cursor-pointer">
      <div class="relative">
        @if (album().coverUrl; as url) {
          <img [src]="url" [alt]="album().title" class="aspect-square w-full rounded-md object-cover shadow-lg" />
        } @else {
          <div [class]="'aspect-square w-full rounded-md flex items-center justify-center text-5xl bg-gradient-to-br shadow-lg ' + album().gradient">
            {{ album().emoji }}
          </div>
        }
        <button (click)="play($event)" title="Play album"
          class="play-btn absolute bottom-2 right-2 w-12 h-12 rounded-full bg-[#1ed760] text-black flex items-center justify-center shadow-xl hover:scale-105">
          <svg viewBox="0 0 24 24" class="w-6 h-6 translate-x-[1px]" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
        </button>
      </div>
      <div class="min-h-[3.2rem]">
        <p class="text-[15px] font-bold text-white truncate hover:underline">{{ album().title }}</p>
        <p class="text-sm text-[#b3b3b3] line-clamp-2 leading-snug mt-1">Album • {{ album().artist }}</p>
      </div>
    </a>
  `,
})
export class AlbumCard {
  private player = inject(PlayerService);

  album = input.required<Album>();

  play(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const a = this.album();
    if (a.tracks.length) this.player.playTrack(a.tracks[0], a.tracks, { type: 'album', id: a.id, name: a.title });
  }
}
