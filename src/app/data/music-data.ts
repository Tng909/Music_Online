export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  /** Real play count from the backend's play log. */
  plays: number;
  gradient: string;
  emoji: string;
  explicit?: boolean;
  /** Path under public/, e.g. "/covers/after-hours.jpg" — null = show gradient */
  coverUrl?: string | null;
  /** Path under public/, e.g. "/audio/blinding-lights.mp3" — null = simulated playback */
  audioUrl?: string | null;
  createdAt?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  gradient: string;
  emoji: string;
  likes: string;
  tracks: Track[];
  coverUrl?: string | null;
  /** Song ids (backend shape); resolved to `tracks` by the API. */
  trackIds?: string[];
  /** Set on playlists a user created from Your Library. */
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt?: string;
}

export interface Artist {
  id: string;
  name: string;
  followers: string;
  gradient: string;
  emoji: string;
  coverUrl?: string | null;
  /** Song ids this artist is linked to or credited on. */
  songIds?: string[];
  /** Distinct listeners of their songs in the last 30 days (computed by the backend). */
  monthlyListeners?: number;
  /** Linked user account id when the artist is also a user. */
  userId?: string | null;
  createdAt?: string;
}


export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** 1234567 -> "1,234,567". */
export function formatCount(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US');
}

/** "Lady Gaga, Bruno Mars" / "A & B" / "A feat. B" -> each artist name (mirrors the backend). */
export function splitArtists(credit: string): string[] {
  return credit
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

/** Where the current queue came from — shown as "Next from: <name>". */
export interface QueueSource {
  type: 'playlist' | 'artist';
  id: string;
  name: string;
}
