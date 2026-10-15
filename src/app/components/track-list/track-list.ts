import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QueueSource, Track, formatCount, formatTime } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { DownloadService } from '../../services/download.service';
import { ArtistLinks } from '../artist-links/artist-links';

type SortKey = 'default' | 'plays-desc' | 'plays-asc' | 'newest' | 'oldest' | 'longest' | 'shortest';
type LengthKey = 'any' | 'short' | 'medium' | 'long';
type UploadedKey = 'any' | '7' | '30' | '365';

const DAY_MS = 864e5;

/** Song table with search + length / upload date / play count filters (playlist and artist pages). */
@Component({
  selector: 'app-track-list',
  imports: [FormsModule, ArtistLinks],
  templateUrl: './track-list.html',
})
export class TrackList {
  player = inject(PlayerService);
  downloads = inject(DownloadService);

  tracks = input.required<Track[]>();
  /** Labels the queue in the player ("Next from: …"). */
  source = input<QueueSource | null>(null);

  query = signal('');
  sort = signal<SortKey>('default');
  length = signal<LengthKey>('any');
  uploaded = signal<UploadedKey>('any');

  currentId = computed(() => this.player.currentTrack()?.id);
  isPlaying = this.player.isPlaying;
  fmt = formatTime;
  count = formatCount;

  filtering = computed(
    () => !!this.query().trim() || this.sort() !== 'default' || this.length() !== 'any' || this.uploaded() !== 'any',
  );

  /** What is listed — and what plays, in this order, when a row is clicked. */
  visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const len = this.length();
    const days = this.uploaded() === 'any' ? null : Number(this.uploaded());
    const now = Date.now();
    const list = this.tracks().filter((t) => {
      if (q && !`${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)) return false;
      if (len === 'short' && t.duration >= 180) return false;
      if (len === 'medium' && (t.duration < 180 || t.duration > 300)) return false;
      if (len === 'long' && t.duration <= 300) return false;
      if (days !== null) {
        const at = t.createdAt ? new Date(t.createdAt).getTime() : NaN;
        if (Number.isNaN(at) || now - at > days * DAY_MS) return false;
      }
      return true;
    });
    const time = (t: Track) => (t.createdAt ? new Date(t.createdAt).getTime() : 0);
    switch (this.sort()) {
      case 'plays-desc':
        return list.sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0));
      case 'plays-asc':
        return list.sort((a, b) => (a.plays ?? 0) - (b.plays ?? 0));
      case 'newest':
        return list.sort((a, b) => time(b) - time(a));
      case 'oldest':
        return list.sort((a, b) => time(a) - time(b));
      case 'longest':
        return list.sort((a, b) => b.duration - a.duration);
      case 'shortest':
        return list.sort((a, b) => a.duration - b.duration);
      default:
        return list;
    }
  });

  reset(): void {
    this.query.set('');
    this.sort.set('default');
    this.length.set('any');
    this.uploaded.set('any');
  }

  play(track: Track): void {
    this.player.playTrack(track, this.visible(), this.source());
  }

  /** Save one song to the user's device (button stops the row's play click). */
  download(event: MouseEvent, track: Track): void {
    event.stopPropagation();
    void this.downloads.download(track);
  }

  toggleLike(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.player.toggleLike(id);
  }

  isLiked(id: string): boolean {
    return this.player.isLiked(id);
  }

  uploadedOn(track: Track): string {
    return track.createdAt ? new Date(track.createdAt).toLocaleDateString() : '—';
  }
}
