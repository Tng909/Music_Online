import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { QueueSource } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { LibraryService } from '../../services/library.service';
import { AuthService } from '../../services/auth.service';
import { TrackList } from '../../components/track-list/track-list';

@Component({
  selector: 'app-playlist',
  imports: [RouterLink, FormsModule, TrackList],
  templateUrl: './playlist.html',
})
export class PlaylistPage {
  player = inject(PlayerService);
  music = inject(MusicService);
  library = inject(LibraryService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  playlistId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  playlist = computed(() => this.music.getPlaylist(this.playlistId()));
  source = computed<QueueSource | null>(() => {
    const pl = this.playlist();
    return pl ? { type: 'playlist', id: pl.id, name: pl.title } : null;
  });
  /** The signed-in user created this playlist: they can edit, delete and remove songs. */
  owned = computed(() => {
    const me = this.auth.user()?.id;
    return !!me && this.playlist()?.ownerId === me;
  });

  /** Edit modal (cover, title, description, songs) and its delete confirmation step. */
  editing = signal(false);
  confirmingDelete = signal(false);
  busy = signal(false);
  error = signal('');
  draftTitle = signal('');
  draftDescription = signal('');
  draftCoverUrl = signal<string | null>(null);
  coverPreview = signal<string | null>(null);
  uploadingCover = signal(false);
  draftTrackIds = signal<string[]>([]);
  trackQuery = signal('');

  /** Songs not yet picked that match the search box (first 8). */
  trackMatches = computed(() => {
    const q = this.trackQuery().trim().toLowerCase();
    const picked = new Set(this.draftTrackIds());
    let list = this.music.songs().filter((s) => !picked.has(s.id));
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
    return list.slice(0, 8);
  });

  pickedTracks = computed(() =>
    this.draftTrackIds().map((id) => this.music.songs().find((s) => s.id === id)).filter((s) => !!s),
  );

  saved = computed(() => this.library.savedIds().has(this.playlistId()));
  /** True while this playlist is what the player is playing from. */
  playingHere = computed(
    () => this.player.isPlaying() && this.player.queueSource()?.id === this.playlist()?.id,
  );

  constructor() {
    // Refresh so play counts are current.
    void this.music.load();
  }

  playAll(): void {
    if (this.player.queueSource()?.id === this.playlist()?.id && this.player.currentTrack()) {
      this.player.toggle();
      return;
    }
    const pl = this.playlist();
    if (pl?.tracks.length) this.player.playTrack(pl.tracks[0], pl.tracks, this.source());
  }

  openEdit(): void {
    const pl = this.playlist();
    if (!pl || !this.owned()) return;
    this.draftTitle.set(pl.title);
    this.draftDescription.set(pl.description ?? '');
    this.draftCoverUrl.set(pl.coverUrl ?? null);
    this.coverPreview.set(pl.coverUrl ?? null);
    this.draftTrackIds.set(pl.tracks.map((t) => t.id));
    this.trackQuery.set('');
    this.confirmingDelete.set(false);
    this.error.set('');
    this.editing.set(true);
  }

  @HostListener('document:keydown.escape')
  closeEdit(): void {
    if (this.busy()) return;
    this.editing.set(false);
    this.confirmingDelete.set(false);
  }

  toggleTrack(id: string): void {
    const ids = this.draftTrackIds();
    this.draftTrackIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  async onCoverFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.coverPreview.set(URL.createObjectURL(file));
    this.uploadingCover.set(true);
    this.error.set('');
    try {
      this.draftCoverUrl.set(await this.library.uploadCover(file));
    } catch (e: unknown) {
      this.coverPreview.set(this.draftCoverUrl());
      this.error.set(this.messageOf(e));
    } finally {
      this.uploadingCover.set(false);
    }
  }

  async saveEdit(): Promise<void> {
    const pl = this.playlist();
    const title = this.draftTitle().trim();
    if (!pl || this.busy() || this.uploadingCover()) return;
    if (!title) return this.error.set('Playlist title is required.');
    await this.run(() =>
      this.library.updatePlaylist(pl.id, {
        title,
        description: this.draftDescription(),
        coverUrl: this.draftCoverUrl(),
        trackIds: this.draftTrackIds(),
      }),
    );
  }

  async deletePlaylist(): Promise<void> {
    const pl = this.playlist();
    if (!pl || this.busy()) return;
    await this.run(() => this.library.deletePlaylist(pl.id));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.editing.set(false);
      this.confirmingDelete.set(false);
    } catch (e: unknown) {
      this.error.set(this.messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }

  private messageOf(e: unknown): string {
    return (e as { error?: { error?: string } }).error?.error ?? 'Something went wrong. Try again.';
  }
}
