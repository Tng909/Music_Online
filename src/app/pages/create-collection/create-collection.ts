import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MusicService } from '../../services/music.service';
import { AuthService } from '../../services/auth.service';
import { UserLibraryService } from '../../services/user-library.service';
import { UserCollection } from '../../data/music-data';

/** Full-page create screen: name + song picker, then saves to the user's library. */
@Component({
  selector: 'app-create-collection',
  imports: [FormsModule],
  templateUrl: './create-collection.html',
})
export class CreateCollectionPage {
  private music = inject(MusicService);
  private auth = inject(AuthService);
  mine = inject(UserLibraryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  kindParam = toSignal(this.route.paramMap.pipe(map((p) => p.get('kind') ?? 'playlist')), {
    initialValue: 'playlist',
  });

  kind = computed<UserCollection['kind']>(() => {
    const k = this.kindParam();
    return k === 'album' || k === 'folder' ? k : 'playlist';
  });

  heading = computed(() =>
    this.kind() === 'album' ? 'Create album' : this.kind() === 'folder' ? 'Create folder' : 'Create playlist',
  );

  title = signal('');
  query = signal('');
  picked = signal<string[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);

  songMatches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const picked = new Set(this.picked());
    let list = this.music.songs().filter((s) => !picked.has(s.id));
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

  pickedSongs = computed(() =>
    this.picked()
      .map((id) => this.music.getSong(id))
      .filter((s) => !!s),
  );

  constructor() {
    if (!this.auth.loggedIn()) void this.router.navigate(['/login']);
    void this.mine.load();
  }

  togglePick(id: string): void {
    const ids = this.picked();
    this.picked.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  cancel(): void {
    void this.router.navigate(['/']);
  }

  async save(): Promise<void> {
    this.error.set(null);
    if (!this.auth.loggedIn()) {
      void this.router.navigate(['/login']);
      return;
    }
    if (!this.title().trim()) {
      this.error.set('Give it a name first.');
      return;
    }
    this.saving.set(true);
    try {
      const c = await this.mine.create(this.kind(), this.title().trim(), this.picked());
      void this.router.navigate(['/collection', c.id]);
    } catch (e) {
      this.error.set(this.mine.messageOf(e));
    } finally {
      this.saving.set(false);
    }
  }
}
