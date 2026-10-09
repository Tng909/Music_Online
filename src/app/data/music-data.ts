export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  plays: string;
  gradient: string;
  emoji: string;
  explicit?: boolean;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  gradient: string;
  emoji: string;
  likes: string;
  tracks: Track[];
}

export interface Artist {
  id: string;
  name: string;
  followers: string;
  gradient: string;
  emoji: string;
}

const t = (
  id: string,
  title: string,
  artist: string,
  album: string,
  duration: number,
  plays: string,
  gradient: string,
  emoji: string,
  explicit = false,
): Track => ({ id, title, artist, album, duration, plays, gradient, emoji, explicit });

export const TRACKS: Track[] = [
  t('t1', 'Blinding Lights', 'The Weeknd', 'After Hours', 203, '4.2B', 'from-rose-500 to-orange-400', '🌃', true),
  t('t2', 'As It Was', 'Harry Styles', "Harry's House", 167, '3.1B', 'from-sky-400 to-indigo-500', '🪩'),
  t('t3', 'Levitating', 'Dua Lipa', 'Future Nostalgia', 203, '2.4B', 'from-fuchsia-500 to-purple-600', '💿'),
  t('t4', 'Stay', 'The Kid LAROI, Justin Bieber', 'F*CK LOVE 3', 141, '2.9B', 'from-red-500 to-pink-500', '🔥', true),
  t('t5', 'Vampire', 'Olivia Rodrigo', 'GUTS', 219, '1.6B', 'from-violet-600 to-slate-900', '🧛'),
  t('t6', 'Cruel Summer', 'Taylor Swift', 'Lover', 178, '2.2B', 'from-amber-400 to-rose-500', '☀️'),
  t('t7', 'Starboy', 'The Weeknd, Daft Punk', 'Starboy', 230, '3.0B', 'from-red-600 to-zinc-900', '⭐', true),
  t('t8', 'Flowers', 'Miley Cyrus', 'Endless Summer Vacation', 200, '2.1B', 'from-yellow-400 to-orange-500', '🌸'),
  t('t9', 'Kill Bill', 'SZA', 'SOS', 153, '1.9B', 'from-teal-400 to-emerald-600', '🔪', true),
  t('t10', 'Anti-Hero', 'Taylor Swift', 'Midnights', 200, '1.7B', 'from-indigo-500 to-purple-700', '🌙'),
  t('t11', 'Unholy', 'Sam Smith, Kim Petras', 'Gloria', 156, '1.8B', 'from-purple-700 to-red-600', '😈', true),
  t('t12', 'Espresso', 'Sabrina Carpenter', 'Short n\u2019 Sweet', 175, '1.5B', 'from-amber-500 to-yellow-300', '☕'),
];

export const PLAYLISTS: Playlist[] = [
  {
    id: 'today-top-hits',
    title: "Today's Top Hits",
    description: 'The biggest songs right now. Cover: chart-toppers on repeat.',
    gradient: 'from-pink-500 via-rose-500 to-orange-400',
    emoji: '📈',
    likes: '34.2M',
    tracks: [TRACKS[0], TRACKS[5], TRACKS[11], TRACKS[4], TRACKS[8], TRACKS[1], TRACKS[9], TRACKS[7]],
  },
  {
    id: 'rap-caviar',
    title: 'RapCaviar',
    description: 'New music from the hip-hop world. The most influential playlist in rap.',
    gradient: 'from-zinc-700 via-zinc-900 to-black',
    emoji: '💎',
    likes: '16.8M',
    tracks: [TRACKS[3], TRACKS[8], TRACKS[10], TRACKS[6], TRACKS[2]],
  },
  {
    id: 'pop-rising',
    title: 'Pop Rising',
    description: 'The freshest pop songs you need to hear first.',
    gradient: 'from-sky-400 via-cyan-400 to-teal-300',
    emoji: '🫧',
    likes: '6.4M',
    tracks: [TRACKS[1], TRACKS[2], TRACKS[11], TRACKS[7], TRACKS[9], TRACKS[5]],
  },
  {
    id: 'rock-classics',
    title: 'Rock Classics',
    description: 'Rock legends & epic songs that continue to inspire generations.',
    gradient: 'from-red-700 via-red-900 to-zinc-900',
    emoji: '🎸',
    likes: '28.1M',
    tracks: [TRACKS[6], TRACKS[0], TRACKS[5], TRACKS[3]],
  },
  {
    id: 'chill-hits',
    title: 'Chill Hits',
    description: 'Kick back to the best new and recent chill tunes.',
    gradient: 'from-indigo-400 via-purple-400 to-pink-300',
    emoji: '🌊',
    likes: '5.9M',
    tracks: [TRACKS[1], TRACKS[9], TRACKS[7], TRACKS[4], TRACKS[11]],
  },
  {
    id: 'mood-booster',
    title: 'Mood Booster',
    description: 'Get happy with this pick-me-up playlist full of feel-good songs.',
    gradient: 'from-yellow-400 via-amber-400 to-orange-500',
    emoji: '😎',
    likes: '8.7M',
    tracks: [TRACKS[2], TRACKS[5], TRACKS[11], TRACKS[7], TRACKS[0]],
  },
  {
    id: 'discover-weekly',
    title: 'Discover Weekly',
    description: 'Your weekly mixtape of fresh music, made just for you.',
    gradient: 'from-green-500 via-emerald-500 to-teal-600',
    emoji: '🔍',
    likes: 'Saved by you',
    tracks: [TRACKS[4], TRACKS[10], TRACKS[8], TRACKS[6], TRACKS[9], TRACKS[3]],
  },
  {
    id: 'daily-mix-1',
    title: 'Daily Mix 1',
    description: 'Taylor Swift, Sabrina Carpenter, Olivia Rodrigo and more.',
    gradient: 'from-cyan-500 via-blue-500 to-indigo-600',
    emoji: '🎧',
    likes: 'Made for you',
    tracks: [TRACKS[5], TRACKS[11], TRACKS[4], TRACKS[9], TRACKS[1]],
  },
];

export const ARTISTS: Artist[] = [
  { id: 'a1', name: 'Taylor Swift', followers: '112M', gradient: 'from-amber-400 to-rose-500', emoji: '🦋' },
  { id: 'a2', name: 'The Weeknd', followers: '98M', gradient: 'from-red-600 to-zinc-900', emoji: '🌃' },
  { id: 'a3', name: 'Dua Lipa', followers: '76M', gradient: 'from-fuchsia-500 to-purple-700', emoji: '💿' },
  { id: 'a4', name: 'SZA', followers: '54M', gradient: 'from-teal-400 to-emerald-600', emoji: '🌿' },
  { id: 'a5', name: 'Harry Styles', followers: '61M', gradient: 'from-sky-400 to-indigo-600', emoji: '🪩' },
  { id: 'a6', name: 'Olivia Rodrigo', followers: '43M', gradient: 'from-violet-600 to-slate-900', emoji: '🧛' },
];

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
