import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTabState } from '../../../services/admin.service';
import { MusicService } from '../../../services/music.service';
import { Playlist } from '../../../data/music-data';

@Component({
  selector: 'app-admin-playlists',
  imports: [FormsModule],
  templateUrl: './playlists.html',
})
export class AdminPlaylists {
  admin = inject(AdminService);
  music = inject(MusicService);

  state = new AdminTabState();
  error = signal<string | null>(null);

  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  fTitle = signal('');
  fDesc = signal('');
  fCoverUrl = signal<string | null>(null);
  fCoverPreview = signal<string | null>(null);
  fTrackIds = signal<string[]>([]);
  fTrackQuery = signal('');
  fSaving = signal(false);
  fError = signal<string | null>(null);

  filtered = computed(() => {
    const q = this.state.query().trim().toLowerCase();
    let list = this.music.playlists();
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    return list;
  });

  rows = computed(() => this.state.slice(this.filtered()));

  trackMatches = computed(() => {
    const q = this.fTrackQuery().trim().toLowerCase();
    const picked = new Set(this.fTrackIds());
    let list = this.music.songs().filter((s) => !picked.has(s.id));
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
    return list.slice(0, 8);
  });

  pickedTracks = computed(() =>
    this.fTrackIds().map((id) => this.music.songs().find((s) => s.id === id)).filter((s) => !!s),
  );

  trackCount(p: Playlist): number {
    return p.tracks?.length ?? p.trackIds?.length ?? 0;
  }

  openAdd(): void {
    this.editingId.set(null);
    this.fTitle.set('');
    this.fDesc.set('');
    this.fCoverUrl.set(null);
    this.fCoverPreview.set(null);
    this.fTrackIds.set([]);
    this.fTrackQuery.set('');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(p: Playlist): void {
    this.editingId.set(p.id);
    this.fTitle.set(p.title);
    this.fDesc.set(p.description);
    this.fCoverUrl.set(p.coverUrl ?? null);
    this.fCoverPreview.set(p.coverUrl ?? null);
    this.fTrackIds.set([...(p.tracks?.map((t) => t.id) ?? p.trackIds ?? [])]);
    this.fTrackQuery.set('');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  toggleTrack(id: string): void {
    const ids = this.fTrackIds();
    this.fTrackIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
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
      this.fError.set('Playlist title is required.');
      return;
    }
    this.fSaving.set(true);
    try {
      const body = {
        title: this.fTitle().trim(),
        description: this.fDesc().trim(),
        coverUrl: this.fCoverUrl(),
        trackIds: this.fTrackIds(),
      };
      const id = this.editingId();
      if (id) await this.admin.updatePlaylist(id, body);
      else await this.admin.createPlaylist(body);
      await this.music.load();
      this.modalOpen.set(false);
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    } finally {
      this.fSaving.set(false);
    }
  }

  async remove(p: Playlist): Promise<void> {
    if (!confirm(`Delete playlist "${p.title}"?`)) return;
    try {
      await this.admin.deletePlaylist(p.id);
      await this.music.load();
      this.state.clamp(this.filtered().length - 1);
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }
}
