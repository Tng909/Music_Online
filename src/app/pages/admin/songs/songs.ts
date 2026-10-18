import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTabState } from '../../../services/admin.service';
import { MusicService } from '../../../services/music.service';
import { Track, formatTime } from '../../../data/music-data';
import { FolderAlert, isFolderAlert, readDuration, readSongFolder } from '../../../data/folder-pick';

/** Same separators the server splits song credits on (server/catalog.js splitArtists). */
const CREDIT_SPLIT = /\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i;

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
  /** True while the title is one we filled in (file / folder name) rather than one the admin typed. */
  fTitleAuto = signal(false);
  /** Set after "Add folder" fills the form, so the admin can keep or undo it. */
  fFromFolder = signal<{ folder: string; cover: string; audio: string } | null>(null);
  folderAlert = signal<FolderAlert | null>(null);
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


  /** Every artist name already in the database (song credits + artist records). */
  knownArtists = computed(() => {
    const names = new Set<string>();
    for (const t of this.music.songs()) {
      for (const n of t.artist.split(',')) {
        const name = n.trim();
        if (name) names.add(name);
      }
    }
    for (const a of this.music.artists()) names.add(a.name);
    return [...names];
  });

  artistSuggestions = computed(() => {
    const q = this.fArtistQuery().trim().toLowerCase();
    const picked = new Set(this.fPickedArtists());
    const all = this.knownArtists().filter((n) => !picked.has(n));
    if (!q) return all.slice(0, 8);
    return all.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  });

  /** The typed name when no existing artist has it: offered as "Add new artist". */
  newArtistName = computed(() => {
    const q = this.fArtistQuery().trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    const taken = [...this.knownArtists(), ...this.fPickedArtists()].some((n) => n.toLowerCase() === lower);
    return taken ? null : q;
  });

  isNewArtist(name: string): boolean {
    const lower = name.toLowerCase();
    return !this.knownArtists().some((n) => n.toLowerCase() === lower);
  }

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
    this.fTitleAuto.set(false);
    this.fFromFolder.set(null);
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
    this.fTitleAuto.set(false);
    this.fFromFolder.set(null);
    this.fError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  /**
   * Pick an artist (existing or new). "A, B" / "A & B" / "A feat. B" adds each one,
   * and a name matching an existing artist uses that artist's spelling.
   */
  addArtist(name: string): void {
    const picked = [...this.fPickedArtists()];
    for (const part of name.split(CREDIT_SPLIT)) {
      const typed = part.trim();
      if (!typed) continue;
      const lower = typed.toLowerCase();
      const n = this.knownArtists().find((k) => k.toLowerCase() === lower) ?? typed;
      if (!picked.some((p) => p.toLowerCase() === lower)) picked.push(n);
    }
    this.fPickedArtists.set(picked);
    this.fArtistQuery.set('');
  }

  removeArtist(name: string): void {
    this.fPickedArtists.set(this.fPickedArtists().filter((a) => a !== name));
  }

  /** Typing in the title makes it the admin's own (file names stop overwriting it). */
  onTitleInput(value: string): void {
    this.fTitle.set(value);
    this.fTitleAuto.set(!value.trim());
  }

  async onCoverFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.setCover(file);
  }

  /** Audio picked → upload + auto duration; title follows the file name unless one was typed. */
  async onAudioFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!this.fTitle().trim() || this.fTitleAuto()) {
      this.fTitle.set(file.name.replace(/\.[^.]+$/, ''));
      this.fTitleAuto.set(true);
    }
    await this.setAudio(file);
  }

  /**
   * "Add folder": the folder must hold exactly one image (cover) and one audio file (song).
   * On success the cover, song and title (= folder name) are filled in for review.
   */
  async onFolder(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = readSongFolder(input.files);
    input.value = ''; // picking the same folder again still fires (change)
    if (isFolderAlert(picked)) {
      this.folderAlert.set(picked);
      return;
    }
    const { folder, cover, audio } = picked;

    this.fError.set(null);
    this.fTitle.set(folder);
    this.fTitleAuto.set(true);
    this.fFromFolder.set({ folder, cover: cover.name, audio: audio.name });
    await Promise.all([this.setCover(cover), this.setAudio(audio)]);
  }

  /** Decline what "Add folder" filled in: back to an empty cover / song / title. */
  undoFolder(): void {
    this.fTitle.set('');
    this.fTitleAuto.set(false);
    this.fCoverUrl.set(null);
    this.fCoverPreview.set(null);
    this.fAudioUrl.set(null);
    this.fAudioName.set('');
    this.fDuration.set(0);
    this.fFromFolder.set(null);
  }

  private async setCover(file: File): Promise<void> {
    this.fCoverPreview.set(URL.createObjectURL(file));
    try {
      this.fCoverUrl.set(await this.admin.uploadCover(file));
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    }
  }

  private async setAudio(file: File): Promise<void> {
    this.fAudioName.set(file.name);
    this.fDuration.set(Math.round(await readDuration(file)));
    try {
      this.fAudioUrl.set(await this.admin.uploadAudio(file));
    } catch (e) {
      this.fError.set(this.admin.messageOf(e));
    }
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
        album: this.fAlbum().trim() || title,
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
