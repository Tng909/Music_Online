import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { MusicService } from '../../services/music.service';

/**
 * A song's artist credit with each name linking to its artist page.
 * Rendered as spans (not <a>) so it can sit inside cards that are links themselves.
 */
@Component({
  selector: 'app-artist-links',
  template: `@for (a of links(); track $index) {@if (!$first) {<span>, </span>}@if (a.id) {<span role="link" tabindex="0"
      class="hover:underline hover:text-white cursor-pointer"
      (click)="open($event, a.id)" (keydown.enter)="open($event, a.id)">{{ a.name }}</span>} @else {<span>{{ a.name }}</span>}}`,
})
export class ArtistLinks {
  private music = inject(MusicService);
  private router = inject(Router);

  credit = input.required<string>();
  links = computed(() => {
    const links = this.music.artistLinks(this.credit());
    return links.length ? links : [{ name: this.credit(), id: null }];
  });

  open(event: Event, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    void this.router.navigate(['/artist', id]);
  }
}
