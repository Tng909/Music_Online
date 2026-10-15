import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PlayerService } from '../../services/player.service';
import { ArtistLinks } from '../artist-links/artist-links';
import { Track } from '../../data/music-data';

/** Right-side panel: now playing, what plays next, and recently played. */
@Component({
  selector: 'app-queue-panel',
  imports: [ArtistLinks, NgTemplateOutlet],
  templateUrl: './queue-panel.html',
  // The <aside> itself is the layout item (full-height column / mobile overlay).
  host: { class: 'contents' },
})
export class QueuePanel {
  player = inject(PlayerService);
  tab = signal<'queue' | 'recent'>('queue');

  play(track: Track): void {
    this.player.playFromQueue(track);
  }

  /** Replay from history: starts a fresh, source-less queue. */
  replay(track: Track): void {
    this.player.playTrack(track, [track]);
  }
}
