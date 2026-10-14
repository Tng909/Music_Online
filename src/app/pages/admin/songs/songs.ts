import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTabState } from '../../../services/admin.service';
import { MusicService } from '../../../services/music.service';
import { Track, formatTime } from '../../../data/music-data';

@Component({
  selector: 'app-admin-songs',
  imports: [FormsModule],
  templateUrl: './songs.html',
})
export class AdminSongs {
  admin = inject(AdminService);
  music = inject(MusicService);

  state = new AdminTabState();
  artistFilter = signal('');
  dateFilter = signal<'newest' | 'oldest' | 'all'>('newest');
  audioOnly = signal(false);
  error = signal<string | null>(null);

  // ---- Add / edit modal ----
  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  fTitle = signal('');
  fAlbum = signal('');
  fDuration = signal(0);
  fCoverUrl = signal<string | null>(null);
  fAudioUrl = signal<string | null>(null);
  fCoverPreview = signal<string | null>(null);
  fPickedArtists = signal<string[]>([]);
  fArtistQuery = signal('');
  fAudioName = signal('');
  fSaving = signal(false);
  fError = signal<string | null>(null);

  fmt = formatTime;

  filtered = computed(() => {
    const q = this.state.query().trim().toLowerCase();
    const af = this.artistFilter().trim().toLowerCase();
    let list = this.music.songs();
    if (q) {
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q),
      );
    }
    if (af) list = list.filter((t) => t.artist.toLowerCase().includes(af));
    if (this.audioOnly()) list = list.filter((t) => !!t.audioUrl);
    return [...list].sort((a, b) => {
      if (this.dateFilter() === 'all') return 0;
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return this.dateFilter() === 'newest' ? db - da : da - db;
    });
  });

  rows = computed(() => this.state.slice(this.filtered()));


  artistSuggestions = computed(() => {
    const q = this.fArtistQuery().trim().toLowerCase();
    const names = new Set<string>();
    for (const t of this.music.songs()) {
      for (const n of t.artist.split(',')) {
        const name = n.trim();
        if (name) names.add(name);
      }
    }
    for (const a of this.music.artists()) names.add(a.name);
    const picked = new Set(this.fPickedArtists());
    const all = [...names].filter((n) => !picked.has(n));
    if (!q) return all.slice(0, 8);
    return all.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  });

  dateOf(t: Track): string {
    if (!t.createdAt) return '—';
    const d = new Date(t.createdAt);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  openAdd(): void {
    this.editingId.set(null);
    this.fTitle.set('');
    this.fAlbum.set('');
    this.fDuration.set(0);
    this.fCoverUrl.set(null);
    this.fAudioUrl.set(null);
    this.fCoverPreview.set(null);
    this.fPickedArtists.set([]);
    this.fArtistQuery.set('');
    this.fAudioName.set('');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(t: Track): void {
    this.editingId.set(t.id);
    this.fTitle.set(t.title);
    this.fAlbum.set(t.album);
    this.fDuration.set(t.duration);
    this.fCoverUrl.set(t.coverUrl ?? null);
    this.fAudioUrl.set(t.audioUrl ?? null);
    this.fCoverPreview.set(t.coverUrl ?? null);
    this.fPickedArtists.set(t.artist.split(',').map((s) => s.trim()).filter(Boolean));
    this.fArtistQuery.set('');
    this.fAudioName.set(t.audioUrl ? (t.audioUrl.split('/').pop() ?? '') : '');
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  addArtist(name: string): void {
    const n = name.trim();
    if (!n || this.fPickedArtists().includes(n)) return;
    this.fPickedArtists.set([...this.fPickedArtists(), n]);
    this.fArtistQuery.set('');
  }

  removeArtist(name: string): void {
    this.fPickedArtists.set(this.fPickedArtists().filter((a) => a !== name));
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

  /** Audio picked → upload + auto duration from the file itself. */
  async onAudioFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.fAudioName.set(file.name);
    this.fDuration.set(Math.round(await AdminSongs.readDuration(file)));
    try {
      this.fAudioUrl.set(await this.admin.uploadAudio(file));
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    }
  }

  private static readDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const el = new Audio();
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        const d = el.duration;
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? d : 0);
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      el.src = url;
    });
  }

  async save(): Promise<void> {
    this.fError.set(null);
    const title = this.fTitle().trim();
    const artists = this.fPickedArtists().join(', ');
    if (!title) {
      this.fError.set('Title is required.');
      return;
    }
    if (!artists) {
      this.fError.set('Pick at least one artist.');
      return;
    }
    if (!this.fDuration() || this.fDuration() <= 0) {
      this.fError.set('Pick an audio file so duration is calculated.');
      return;
    }
    this.fSaving.set(true);
    try {
      const body = {
        title,
        artist: artists,
        album: this.fAlbum().trim() || 'Single',
        duration: this.fDuration(),
        coverUrl: this.fCoverUrl(),
        audioUrl: this.fAudioUrl(),
      };
      const id = this.editingId();
      if (id) await this.admin.updateSong(id, body);
      else await this.admin.createSong(body);
      await this.music.load();
      this.modalOpen.set(false);
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    } finally {
      this.fSaving.set(false);
    }
  }

  async remove(t: Track): Promise<void> {
    if (!confirm(`Remove "${t.title}"?`)) return;
    try {
      await this.admin.deleteSong(t.id);
      await this.music.load();
      this.state.clamp(this.filtered().length - 1);
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }
}
