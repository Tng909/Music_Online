import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Artist, Track, formatCount, formatTime } from '../../data/music-data';
import { Pager } from '../../services/admin.service';
import { MusicService } from '../../services/music.service';
import { AlbumFolderManifest, StudioAlbum, StudioService, albumsOf } from '../../services/studio.service';
import {
  FolderAlert,
  isFolderAlert,
  isImageFile,
  readAlbumFolder,
  readDuration,
  readSongFolder,
} from '../../data/folder-pick';

type Tab = 'songs' | 'albums';

/** One song read from an album folder, editable before it is sent. */
interface FolderSong {
  key: number;
  title: string;
  audio: File;
  cover: File | null;
  coverPreview: string | null;
  duration: number;
  /** Sub-folder it came from ("" = main folder). */
  from: string;
}

/** Album folder under review: nothing is uploaded until "Add album". */
interface FolderAlbum {
  folder: string;
  cover: File;
  coverPreview: string;
  songs: FolderSong[];
}
type SongSort = 'newest' | 'oldest' | 'plays' | 'title';

/** Artist studio (/studio): an artist creates and edits their own songs and albums. */
@Component({
  selector: 'app-studio',
  imports: [FormsModule, RouterLink],
  templateUrl: './studio.html',
})
export class StudioPage {
  private studio = inject(StudioService);
  music = inject(MusicService);

  fmt = formatTime;
  count = formatCount;

  tab = signal<Tab>('songs');
  artist = signal<Artist | null>(null);
  songs = signal<Track[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  /** Row waiting for the inline "Delete?" confirmation (song id or album name). */
  confirmDelete = signal<string | null>(null);
  /** A picked folder that can't be used (shown as an alert card). */
  folderAlert = signal<FolderAlert | null>(null);

  albums = computed(() => albumsOf(this.songs()));

  // ---- Songs list ----
  songPager = new Pager();
  songQuery = signal('');
  albumFilter = signal('');
  songSort = signal<SongSort>('newest');

  filteredSongs = computed(() => {
    const q = this.songQuery().trim().toLowerCase();
    const album = this.albumFilter().toLowerCase();
    const list = this.songs().filter((s) => {
      if (album && (s.album || s.title).toLowerCase() !== album) return false;
      return !q || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q);
    });
    const time = (s: Track) => (s.createdAt ? new Date(s.createdAt).getTime() : 0);
    switch (this.songSort()) {
      case 'oldest':
        return list.sort((a, b) => time(a) - time(b));
      case 'plays':
        return list.sort((a, b) => this.playsOf(b) - this.playsOf(a));
      case 'title':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return list.sort((a, b) => time(b) - time(a));
    }
  });
  songRows = computed(() => this.songPager.slice(this.filteredSongs()));

  // ---- Albums list ----
  albumPager = new Pager();
  albumQuery = signal('');
  filteredAlbums = computed(() => {
    const q = this.albumQuery().trim().toLowerCase();
    return this.albums().filter((a) => !q || `${a.name} ${a.songs.map((s) => s.title).join(' ')}`.toLowerCase().includes(q));
  });
  albumRows = computed(() => this.albumPager.slice(this.filteredAlbums()));

  // ---- Song modal ----
  songModal = signal(false);
  editingSongId = signal<string | null>(null);
  fTitle = signal('');
  fTitleAuto = signal(false);
  fAlbum = signal('');
  fFeatured = signal<string[]>([]);
  fFeatQuery = signal('');
  fDuration = signal(0);
  fCoverUrl = signal<string | null>(null);
  fCoverPreview = signal<string | null>(null);
  fAudioUrl = signal<string | null>(null);
  fAudioName = signal('');
  /** Files picked in the form; sent together with it on save. */
  fCoverFile = signal<File | null>(null);
  fAudioFile = signal<File | null>(null);
  /** Set after "Add folder" fills the song form, so the artist can keep or undo it. */
  fFromFolder = signal<{ folder: string; cover: string; audio: string } | null>(null);
  fSaving = signal(false);
  fError = signal<string | null>(null);

  featSuggestions = computed(() => {
    const q = this.fFeatQuery().trim().toLowerCase();
    if (!q) return [];
    const me = this.artist()?.name.toLowerCase();
    const picked = new Set(this.fFeatured().map((n) => n.toLowerCase()));
    return this.music
      .artists()
      .map((a) => a.name)
      .filter((n) => n.toLowerCase() !== me && !picked.has(n.toLowerCase()) && n.toLowerCase().includes(q))
      .slice(0, 6);
  });

  // ---- Album modal ----
  albumModal = signal(false);
  editingAlbum = signal<string | null>(null);
  aName = signal('');
  aSongIds = signal<string[]>([]);
  aQuery = signal('');
  aSaving = signal(false);
  aError = signal<string | null>(null);
  /** Album folder being reviewed in the album modal (new songs from the folder). */
  aFolder = signal<FolderAlbum | null>(null);

  albumMatches = computed(() => {
    const q = this.aQuery().trim().toLowerCase();
    const picked = new Set(this.aSongIds());
    return this.songs()
      .filter((s) => !picked.has(s.id) && (!q || s.title.toLowerCase().includes(q)))
      .slice(0, 8);
  });
  albumPicked = computed(() =>
    this.aSongIds().map((id) => this.songs().find((s) => s.id === id)).filter((s) => !!s),
  );

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.error.set(null);
      const data = await this.studio.me();
      this.artist.set(data.artist);
      this.songs.set(data.songs);
    } catch (e) {
      this.error.set(this.studio.messageOf(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Real play counts come with the public catalog. */
  playsOf(s: Track): number {
    return this.music.songs().find((t) => t.id === s.id)?.plays ?? 0;
  }

  /** Other credited artists (everyone but the signed-in artist). */
  featuredOf(s: Track): string[] {
    const me = this.artist()?.name.toLowerCase();
    return s.artist.split(',').map((n) => n.trim()).filter((n) => n && n.toLowerCase() !== me);
  }

  /** Alone in an album named after itself. */
  isSingle(s: Track): boolean {
    const name = (s.album || s.title).toLowerCase();
    if (name !== s.title.toLowerCase()) return false;
    return (this.albums().find((a) => a.name.toLowerCase() === name)?.songs.length ?? 1) === 1;
  }

  // ---- Song modal ----
  openAddSong(album = ''): void {
    this.editingSongId.set(null);
    this.fTitle.set('');
    this.fTitleAuto.set(false);
    this.fAlbum.set(album);
    this.fFeatured.set([]);
    this.fFeatQuery.set('');
    this.fDuration.set(0);
    this.fCoverUrl.set(null);
    this.fCoverPreview.set(null);
    this.fAudioUrl.set(null);
    this.fAudioName.set('');
    this.fCoverFile.set(null);
    this.fAudioFile.set(null);
    this.fFromFolder.set(null);
    this.fError.set(null);
    this.songModal.set(true);
  }

  openEditSong(s: Track): void {
    this.editingSongId.set(s.id);
    this.fTitle.set(s.title);
    this.fTitleAuto.set(false);
    // A single shows an empty album field: it follows the title.
    this.fAlbum.set(this.isSingle(s) ? '' : s.album);
    this.fFeatured.set(this.featuredOf(s));
    this.fFeatQuery.set('');
    this.fDuration.set(s.duration);
    this.fCoverUrl.set(s.coverUrl ?? null);
    this.fCoverPreview.set(s.coverUrl ?? null);
    this.fAudioUrl.set(s.audioUrl ?? null);
    this.fAudioName.set(s.audioUrl ? (s.audioUrl.split('/').pop() ?? '') : '');
    this.fCoverFile.set(null);
    this.fAudioFile.set(null);
    this.fFromFolder.set(null);
    this.fError.set(null);
    this.songModal.set(true);
  }

  closeSongModal(): void {
    if (!this.fSaving()) this.songModal.set(false);
  }

  onTitleInput(v: string): void {
    this.fTitle.set(v);
    this.fTitleAuto.set(!v.trim());
  }

  addFeatured(name: string): void {
    const n = name.trim();
    const me = this.artist()?.name.toLowerCase();
    if (n && n.toLowerCase() !== me && !this.fFeatured().some((x) => x.toLowerCase() === n.toLowerCase())) {
      this.fFeatured.set([...this.fFeatured(), n]);
    }
    this.fFeatQuery.set('');
  }

  removeFeatured(name: string): void {
    this.fFeatured.set(this.fFeatured().filter((n) => n !== name));
  }

  async onCoverFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.setCover(file);
  }

  /** Song file: duration from the file; title follows the file name unless typed. */
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
   * "Add folder" for one song: exactly 1 cover image + 1 song file. Fills the
   * cover, song and title (= folder name) for review; nothing else changes.
   */
  async onSongFolder(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = readSongFolder(input.files);
    input.value = ''; // picking the same folder again still fires (change)
    if (isFolderAlert(picked)) return this.folderAlert.set(picked);
    this.fError.set(null);
    this.fTitle.set(picked.folder);
    this.fTitleAuto.set(true);
    this.fFromFolder.set({ folder: picked.folder, cover: picked.cover.name, audio: picked.audio.name });
    await Promise.all([this.setCover(picked.cover), this.setAudio(picked.audio)]);
  }

  /** Decline what "Add folder" filled in. */
  undoSongFolder(): void {
    this.fTitle.set('');
    this.fTitleAuto.set(false);
    this.fCoverUrl.set(null);
    this.fCoverPreview.set(null);
    this.fAudioUrl.set(null);
    this.fAudioName.set('');
    this.fDuration.set(0);
    this.fCoverFile.set(null);
    this.fAudioFile.set(null);
    this.fFromFolder.set(null);
  }

  /** Picked cover: preview now, uploaded on save. */
  private async setCover(file: File): Promise<void> {
    this.fCoverFile.set(file);
    this.fCoverPreview.set(URL.createObjectURL(file));
  }

  /** Picked song: name + duration now, uploaded on save. */
  private async setAudio(file: File): Promise<void> {
    this.fAudioFile.set(file);
    this.fAudioName.set(file.name);
    this.fDuration.set(Math.round(await readDuration(file)));
  }

  async saveSong(): Promise<void> {
    this.fError.set(null);
    const title = this.fTitle().trim();
    if (!title) return this.fError.set('Title is required.');
    if (!this.fDuration()) return this.fError.set('Pick a song file so the duration is known.');
    this.fSaving.set(true);
    try {
      const body = {
        title,
        featured: this.fFeatured(),
        album: this.fAlbum().trim(),
        duration: this.fDuration(),
        coverUrl: this.fCoverUrl(),
        audioUrl: this.fAudioUrl(),
      };
      const files = { cover: this.fCoverFile(), audio: this.fAudioFile() };
      const id = this.editingSongId();
      if (id) await this.studio.updateSong(id, body, files);
      else await this.studio.createSong(body, files);
      this.songModal.set(false);
      await Promise.all([this.reload(), this.music.load()]);
    } catch (e) {
      this.fError.set(this.studio.messageOf(e));
    } finally {
      this.fSaving.set(false);
    }
  }

  async deleteSong(s: Track): Promise<void> {
    try {
      await this.studio.deleteSong(s.id);
      this.confirmDelete.set(null);
      await Promise.all([this.reload(), this.music.load()]);
      this.songPager.clamp(this.filteredSongs().length);
    } catch (e) {
      this.error.set(this.studio.messageOf(e));
    }
  }

  // ---- Album modal ----
  openAddAlbum(): void {
    this.editingAlbum.set(null);
    this.aName.set('');
    this.aSongIds.set([]);
    this.aQuery.set('');
    this.aError.set(null);
    this.aFolder.set(null);
    this.albumModal.set(true);
  }

  openEditAlbum(a: StudioAlbum): void {
    this.editingAlbum.set(a.name);
    this.aName.set(a.name);
    this.aSongIds.set(a.songs.map((s) => s.id));
    this.aQuery.set('');
    this.aError.set(null);
    this.aFolder.set(null);
    this.albumModal.set(true);
  }

  closeAlbumModal(): void {
    if (!this.aSaving()) this.albumModal.set(false);
  }

  toggleAlbumSong(id: string): void {
    const ids = this.aSongIds();
    this.aSongIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  /** Name of the album a song is in now, when it is not a single (shown while picking). */
  currentAlbum(s: Track): string | null {
    return this.isSingle(s) ? null : s.album;
  }

  /**
   * Album folder: 1 cover in the main folder (album cover + cover of songs
   * without their own), songs in the main folder and/or one sub-folder per song
   * (1 cover + 1 song, named after the sub-folder). Opens the album form with
   * everything filled in; files are only sent on "Add album".
   */
  async onAlbumFolder(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = readAlbumFolder(input.files);
    input.value = '';
    if (isFolderAlert(picked)) return this.folderAlert.set(picked);
    const durations = await Promise.all(picked.songs.map((x) => readDuration(x.audio)));
    if (!this.albumModal()) this.openAddAlbum();
    this.editingAlbum.set(null);
    this.aName.set(picked.folder);
    this.aError.set(null);
    this.aFolder.set({
      folder: picked.folder,
      cover: picked.cover,
      coverPreview: URL.createObjectURL(picked.cover),
      songs: picked.songs.map((x, i) => ({
        key: i,
        title: x.title,
        audio: x.audio,
        cover: x.cover,
        coverPreview: x.cover ? URL.createObjectURL(x.cover) : null,
        duration: Math.round(durations[i]),
        from: x.from,
      })),
    });
  }

  /** Decline the folder: back to an empty "Add album" form. */
  undoAlbumFolder(): void {
    this.aFolder.set(null);
    this.aName.set('');
    this.aError.set(null);
  }

  setFolderSongTitle(key: number, title: string): void {
    this.updateFolder((f) => ({ ...f, songs: f.songs.map((x) => (x.key === key ? { ...x, title } : x)) }));
  }

  removeFolderSong(key: number): void {
    this.updateFolder((f) => ({ ...f, songs: f.songs.filter((x) => x.key !== key) }));
  }

  /** Replace the album cover (also the cover of songs without their own). */
  onFolderCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!isImageFile(file)) return this.aError.set('The album cover must be an image.');
    this.updateFolder((f) => ({ ...f, cover: file, coverPreview: URL.createObjectURL(file) }));
  }

  /** Replace one folder song's own cover. */
  onFolderSongCover(key: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!isImageFile(file)) return this.aError.set('A song cover must be an image.');
    this.updateFolder((f) => ({
      ...f,
      songs: f.songs.map((x) => (x.key === key ? { ...x, cover: file, coverPreview: URL.createObjectURL(file) } : x)),
    }));
  }

  async saveAlbum(): Promise<void> {
    this.aError.set(null);
    const folder = this.aFolder();
    if (folder) return this.saveAlbumFolder(folder);
    let name = this.aName().trim();
    const ids = this.aSongIds();
    if (!ids.length) return this.aError.set('Pick at least one song.');
    // Empty name with one song: the album is named after that song.
    if (!name && ids.length === 1) name = this.songs().find((s) => s.id === ids[0])?.title ?? '';
    if (!name) return this.aError.set('Album name is required.');
    this.aSaving.set(true);
    try {
      const data = await this.studio.saveAlbum(name, ids, this.editingAlbum() ?? undefined);
      this.songs.set(data.songs);
      this.albumModal.set(false);
      void this.music.load();
    } catch (e) {
      this.aError.set(this.studio.messageOf(e));
    } finally {
      this.aSaving.set(false);
    }
  }

  /** Send the reviewed album folder (+ any existing songs picked) in one upload. */
  private async saveAlbumFolder(folder: FolderAlbum): Promise<void> {
    const ids = this.aSongIds();
    if (!folder.songs.length && !ids.length) return this.aError.set('Keep at least one song.');
    let name = this.aName().trim();
    if (!name && folder.songs.length + ids.length === 1) name = folder.songs[0]?.title.trim() ?? '';
    if (!name) return this.aError.set('Album name is required.');
    const untitled = folder.songs.find((x) => !x.title.trim());
    if (untitled) return this.aError.set(`Give the song from “${untitled.audio.name}” a title.`);
    const unreadable = folder.songs.find((x) => !x.duration);
    if (unreadable) return this.aError.set(`Can't read the length of “${unreadable.audio.name}”. Remove it or use another file.`);

    const files: File[] = [folder.cover];
    const manifest: AlbumFolderManifest = { album: name, cover: 0, songs: [], existingSongIds: ids };
    for (const x of folder.songs) {
      files.push(x.audio);
      const audio = files.length - 1;
      let cover: number | null = null;
      if (x.cover) {
        files.push(x.cover);
        cover = files.length - 1;
      }
      manifest.songs.push({ title: x.title.trim(), audio, cover, duration: x.duration });
    }
    this.aSaving.set(true);
    try {
      const data = await this.studio.createAlbumFromFolder(manifest, files);
      this.songs.set(data.songs);
      this.albumModal.set(false);
      this.aFolder.set(null);
      this.tab.set('albums');
      void this.music.load();
    } catch (e) {
      this.aError.set(this.studio.messageOf(e));
    } finally {
      this.aSaving.set(false);
    }
  }

  private updateFolder(fn: (f: FolderAlbum) => FolderAlbum): void {
    const f = this.aFolder();
    if (f) this.aFolder.set(fn(f));
  }

  async deleteAlbum(a: StudioAlbum): Promise<void> {
    try {
      const data = await this.studio.deleteAlbum(a.name);
      this.songs.set(data.songs);
      this.confirmDelete.set(null);
      this.albumPager.clamp(this.filteredAlbums().length);
      void this.music.load();
    } catch (e) {
      this.error.set(this.studio.messageOf(e));
    }
  }
}
