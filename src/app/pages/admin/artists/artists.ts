import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTabState } from '../../../services/admin.service';
import { MusicService } from '../../../services/music.service';
import { Artist } from '../../../data/music-data';

@Component({
  selector: 'app-admin-artists',
  imports: [FormsModule],
  templateUrl: './artists.html',
})
export class AdminArtists {
  admin = inject(AdminService);
  music = inject(MusicService);

  state = new AdminTabState();
  error = signal<string | null>(null);

  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  fName = signal('');
  fCoverUrl = signal<string | null>(null);
  fCoverPreview = signal<string | null>(null);
  fSongIds = signal<string[]>([]);
  fSongQuery = signal('');
  fSaving = signal(false);
  fError = signal<string | null>(null);

  filtered = computed(() => {
    const q = this.state.query().trim().toLowerCase();
    let list = this.music.artists();
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  });

  rows = computed(() => this.state.slice(this.filtered()));

  songMatches = computed(() => {
    const q = this.fSongQuery().trim().toLowerCase();
    const picked = new Set(this.fSongIds());
    let list = this.music.songs().filter((s) => !picked.has(s.id));
    if (q) {
      list = list.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 8);
  });

  pickedSongs = computed(() =>
    this.fSongIds()
      .map((id) => this.music.songs().find((s) => s.id === id))
      .filter((s) => !!s),
  );

  dateOf(a: Artist): string {
    if (!a.createdAt) return '—';
    const d = new Date(a.createdAt);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  songCount(a: Artist): number {
    return a.songIds?.length ?? 0;
  }

  openAdd(): void {
    this.editingId.set(null);
    this.fName.set('');
    this.fCoverUrl.set(null);
    this.fCoverPreview.set(null);
    this.fSongIds.set([]);
    this.fSongQuery.set('');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(a: Artist): void {
    this.editingId.set(a.id);
    this.fName.set(a.name);
    this.fCoverUrl.set(a.coverUrl ?? null);
    this.fCoverPreview.set(a.coverUrl ?? null);
    this.fSongIds.set([...(a.songIds ?? [])]);
    this.fSongQuery.set('');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  toggleSong(id: string): void {
    const ids = this.fSongIds();
    this.fSongIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  async onCoverFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.fCoverPreview.set(URL.createObjectURL(file));
    try {
      this.fCoverUrl.set(await this.admin.uploadCover(file));
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    }
  }

  async save(): Promise<void> {
    this.fError.set(null);
    if (!this.fName().trim()) {
      this.fError.set('Artist name is required.');
      return;
    }
    this.fSaving.set(true);
    try {
      const body = { name: this.fName().trim(), coverUrl: this.fCoverUrl(), songIds: this.fSongIds() };
      const id = this.editingId();
      if (id) await this.admin.updateArtist(id, body);
      else await this.admin.createArtist(body);
      await this.music.load();
      this.modalOpen.set(false);
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    } finally {
      this.fSaving.set(false);
    }
  }

  async remove(a: Artist): Promise<void> {
    if (!confirm(`Delete artist "${a.name}"?`)) return;
    try {
      await this.admin.deleteArtist(a.id);
      await this.music.load();
      this.state.clamp(this.filtered().length - 1);
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }
}
