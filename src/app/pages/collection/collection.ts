import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { QueueSource } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MusicService } from '../../services/music.service';
import { AuthService } from '../../services/auth.service';
import { UserLibraryService } from '../../services/user-library.service';
import { TrackList } from '../../components/track-list/track-list';

/** A user's own playlist / album / folder: header + rename + add/remove songs. */
@Component({
  selector: 'app-collection',
  imports: [RouterLink, FormsModule, TrackList],
  templateUrl: './collection.html',
})
export class CollectionPage {
  player = inject(PlayerService);
  music = inject(MusicService);
  auth = inject(AuthService);
  mine = inject(UserLibraryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  collectionId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  collection = computed(() => this.mine.get(this.collectionId()));
  tracks = computed(() => {
    const c = this.collection();
    return c ? this.mine.tracksOf(c) : [];
  });
  source = computed<QueueSource | null>(() => {
    const c = this.collection();
    return c ? { type: 'collection', id: c.id, name: c.title } : null;
  });
  playingHere = computed(
    () => this.player.isPlaying() && this.player.queueSource()?.id === this.collection()?.id,
  );
  kindLabel = computed(() => {
    const k = this.collection()?.kind;
    return k === 'album' ? 'Album' : k === 'folder' ? 'Folder' : 'Playlist';
  });

  editing = signal(false);
  editTitle = signal('');
  editError = signal<string | null>(null);

  addOpen = signal(false);
  addQuery = signal('');
  addBusy = signal(false);
  addError = signal<string | null>(null);

  addMatches = computed(() => {
    const c = this.collection();
    if (!c) return [];
    const q = this.addQuery().trim().toLowerCase();
    const have = new Set(c.trackIds || []);
    let list = this.music.songs().filter((s) => !have.has(s.id));
    if (q) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.album.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 30);
  });

  constructor() {
    if (!this.auth.loggedIn()) void this.router.navigate(['/login']);
    void this.music.load();
    void this.mine.load();
  }

  playAll(): void {
    if (this.player.queueSource()?.id === this.collection()?.id && this.player.currentTrack()) {
      this.player.toggle();
      return;
    }
    const tracks = this.tracks();
    if (tracks.length) this.player.playTrack(tracks[0], tracks, this.source());
  }

  startEdit(): void {
    this.editTitle.set(this.collection()?.title ?? '');
    this.editError.set(null);
    this.editing.set(true);
  }

  async saveEdit(): Promise<void> {
    const c = this.collection();
    if (!c) return;
    const name = this.editTitle().trim();
    if (!name) {
      this.editError.set('Give it a name first.');
      return;
    }
    try {
      await this.mine.rename(c.id, name);
      this.editing.set(false);
    } catch (e) {
      this.editError.set(this.mine.messageOf(e));
    }
  }

  async addSong(id: string): Promise<void> {
    const c = this.collection();
    if (!c) return;
    this.addBusy.set(true);
    this.addError.set(null);
    try {
      await this.mine.addTracks(c.id, [id]);
    } catch (e) {
      this.addError.set(this.mine.messageOf(e));
    } finally {
      this.addBusy.set(false);
    }
  }

  async removeSong(trackId: string): Promise<void> {
    const c = this.collection();
    if (!c) return;
    try {
      await this.mine.removeTrack(c.id, trackId);
    } catch {
      /* track list stays as-is on failure */
    }
  }

  async deleteCollection(): Promise<void> {
    const c = this.collection();
    if (!c) return;
    if (!confirm(`Delete "${c.title}"? The songs stay in the catalog.`)) return;
    try {
      await this.mine.remove(c.id);
      void this.router.navigate(['/']);
    } catch {
      /* stays on page on failure */
    }
  }
}
