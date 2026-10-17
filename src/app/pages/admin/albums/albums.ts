import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTabState } from '../../../services/admin.service';
import { MusicService } from '../../../services/music.service';
import { Album } from '../../../data/music-data';

@Component({
  selector: 'app-admin-albums',
  imports: [FormsModule],
  templateUrl: './albums.html',
})
export class AdminAlbums {
  admin = inject(AdminService);
  music = inject(MusicService);

  state = new AdminTabState();
  error = signal<string | null>(null);

  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  fTitle = signal('');
  fArtist = signal('');
  fCoverUrl = signal<string | null>(null);
  fCoverPreview = signal<string | null>(null);
  fSongIds = signal<string[]>([]);
  fSongQuery = signal('');
  fSaving = signal(false);
  fError = signal<string | null>(null);

  filtered = computed(() => {
    const q = this.state.query().trim().toLowerCase();
    let list = this.music.albums();
    if (q) {
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0));
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

  songCount(a: Album): number {
    return a.tracks?.length ?? a.songIds?.length ?? 0;
  }

  openAdd(): void {
    this.editingId.set(null);
    this.fTitle.set('');
    this.fArtist.set('');
    this.fCoverUrl.set(null);
    this.fCoverPreview.set(null);
    this.fSongIds.set([]);
    this.fSongQuery.set('');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(a: Album): void {
    this.editingId.set(a.id);
    this.fTitle.set(a.title);
    this.fArtist.set(a.artist);
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
    if (!this.fTitle().trim()) {
      this.fError.set('Album title is required.');
      return;
    }
    this.fSaving.set(true);
    try {
      const body = {
        title: this.fTitle().trim(),
        artist: this.fArtist().trim() || 'Unknown Artist',
        coverUrl: this.fCoverUrl(),
        songIds: this.fSongIds(),
      };
      const id = this.editingId();
      if (id) await this.admin.updateAlbum(id, body);
      else await this.admin.createAlbum(body);
      await this.music.load();
      this.modalOpen.set(false);
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    } finally {
      this.fSaving.set(false);
    }
  }

  async remove(a: Album): Promise<void> {
    if (!confirm(`Delete album "${a.title}"? Songs stay in the catalog.`)) return;
    try {
      await this.admin.deleteAlbum(a.id);
      await this.music.load();
      this.state.clamp(this.filtered().length - 1);
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }
}
