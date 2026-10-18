/**
 * Reading folders picked with <input type="file" webkitdirectory> for the
 * "Add folder" options (admin + artist studio): one song per folder, or a whole
 * album (cover + songs, optionally one sub-folder per song).
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;
/** OS bookkeeping files that sit in folders unseen — not counted as "extra files". */
const SYSTEM_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

/** Shown in the alert card when a picked folder can't be used. */
export interface FolderAlert {
  folder: string;
  reason: string;
  /** What was found, or (album folders) each problem on its own line. */
  files: string[];
}

export interface SongFolder {
  folder: string;
  cover: File;
  audio: File;
}

export interface AlbumFolderSong {
  title: string;
  audio: File;
  /** The song's own cover (sub-folder); null = use the album cover. */
  cover: File | null;
  /** Where it came from: the sub-folder name, or "" for the main folder. */
  from: string;
}

export interface AlbumFolder {
  folder: string;
  /** The main folder's cover image; null when it has none. */
  cover: File | null;
  songs: AlbumFolderSong[];
}

export const isImageFile = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
export const isAudioFile = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
export const isFolderAlert = (v: unknown): v is FolderAlert => !!v && typeof v === 'object' && 'reason' in v;

/** "Night Drive.mp3" -> "Night Drive". */
export const fileTitle = (f: File) => f.name.replace(/\.[^.]+$/, '');

/** Path parts after the picked folder: ["song.mp3"] or ["Sub", "song.mp3"]. */
function parts(f: File): string[] {
  return (f.webkitRelativePath || f.name).split('/').slice(1);
}

function visible(files: FileList | File[] | null): File[] {
  return [...(files ?? [])].filter((f) => !SYSTEM_FILES.has(f.name.toLowerCase()));
}

function folderName(files: FileList | File[] | null): string {
  const first = [...(files ?? [])][0];
  return first ? (first.webkitRelativePath || first.name).split('/')[0] : '';
}

/** Exactly one cover image + one song file, nothing else, no sub-folders. */
export function readSongFolder(picked: FileList | File[] | null): SongFolder | FolderAlert {
  const folder = folderName(picked);
  const files = visible(picked);
  if (!files.length) return { folder, reason: 'This folder is empty.', files: [] };
  const names = files.map((f) => parts(f).join('/') || f.name);
  const fail = (reason: string): FolderAlert => ({ folder, reason, files: names });
  if (files.some((f) => parts(f).length > 1)) return fail('The folder must not contain sub-folders.');
  const covers = files.filter(isImageFile);
  const songs = files.filter(isAudioFile);
  if (files.length !== 2 || covers.length !== 1 || songs.length !== 1) {
    return fail(`It must contain exactly 2 files: 1 cover image and 1 song file. Found ${files.length} file${files.length === 1 ? '' : 's'}${files.length ? ` (${covers.length} image, ${songs.length} audio)` : ''}.`);
  }
  return { folder, cover: covers[0], audio: songs[0] };
}

/**
 * Album folder: at most one cover image in the main folder (album cover, and the
 * cover of every song without its own), song files in the main folder, and/or
 * sub-folders that each follow the song-folder rule (1 cover + 1 song).
 * At least one song in total.
 */
export function readAlbumFolder(picked: FileList | File[] | null): AlbumFolder | FolderAlert {
  const folder = folderName(picked);
  const files = visible(picked);
  if (!files.length) return { folder, reason: 'This folder is empty.', files: [] };

  const problems: string[] = [];
  const root = files.filter((f) => parts(f).length === 1);
  const subs = new Map<string, File[]>();
  for (const f of files) {
    const p = parts(f);
    if (p.length === 2) subs.set(p[0], [...(subs.get(p[0]) ?? []), f]);
    else if (p.length > 2) problems.push(`${p.slice(0, -1).join('/')}: folders inside a song folder are not allowed.`);
  }

  const rootCovers = root.filter(isImageFile);
  const rootSongs = root.filter(isAudioFile);
  for (const f of root) {
    if (!isImageFile(f) && !isAudioFile(f)) problems.push(`${f.name}: not a cover image or song file.`);
  }
  // No cover is fine (one is picked from the songs later); more than one is ambiguous.
  if (rootCovers.length > 1) {
    problems.push(`The main folder can have only 1 cover image (found ${rootCovers.length}).`);
  }

  const songs: AlbumFolderSong[] = rootSongs.map((f) => ({ title: fileTitle(f), audio: f, cover: null, from: '' }));
  for (const [name, list] of [...subs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const direct = list.filter((f) => parts(f).length === 2);
    const covers = direct.filter(isImageFile);
    const audio = direct.filter(isAudioFile);
    if (direct.length !== 2 || covers.length !== 1 || audio.length !== 1) {
      problems.push(`${name}/: needs exactly 1 cover image and 1 song file (found ${direct.length} file${direct.length === 1 ? '' : 's'}: ${covers.length} image, ${audio.length} audio).`);
      continue;
    }
    songs.push({ title: name, audio: audio[0], cover: covers[0], from: name });
  }
  if (!songs.length && !problems.length) problems.push('No song files found.');

  if (problems.length) {
    return { folder, reason: 'This folder does not follow the album layout.', files: problems };
  }
  return { folder, cover: rootCovers[0] ?? null, songs };
}

/** Length of an audio file in seconds (0 when the browser can't read it). */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}
