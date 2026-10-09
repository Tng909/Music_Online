import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ARTISTS, PLAYLISTS, TRACKS, Track } from '../../data/music-data';
import { PlayerService } from '../../services/player.service';
import { MediaCard } from '../../components/media-card/media-card';

const BROWSE_CARDS = [
  { title: 'Podcasts', gradient: 'from-purple-700 to-indigo-900', emoji: '🎙️' },
  { title: 'Made For You', gradient: 'from-green-600 to-teal-700', emoji: '✨' },
  { title: 'Charts', gradient: 'from-rose-500 to-red-700', emoji: '📈' },
  { title: 'New Releases', gradient: 'from-slate-600 to-zinc-900', emoji: '🆕' },
  { title: 'Pop', gradient: 'from-pink-500 to-rose-400', emoji: '🫧' },
  { title: 'Hip-Hop', gradient: 'from-amber-600 to-orange-800', emoji: '🎤' },
  { title: 'Rock', gradient: 'from-red-700 to-zinc-900', emoji: '🎸' },
  { title: 'Latin', gradient: 'from-yellow-500 to-orange-600', emoji: '💃' },
  { title: 'K-Pop', gradient: 'from-fuchsia-500 to-purple-700', emoji: '💜' },
  { title: 'Jazz', gradient: 'from-sky-600 to-indigo-800', emoji: '🎷' },
  { title: 'Classical', gradient: 'from-stone-500 to-stone-800', emoji: '🎻' },
  { title: 'Workout', gradient: 'from-lime-500 to-green-700', emoji: '💪' },
];

@Component({
  selector: 'app-search',
  imports: [MediaCard],
  templateUrl: './search.html',
})
export class Search {
  player = inject(PlayerService);
  private route = inject(ActivatedRoute);

  query = signal('');
  browseCards = BROWSE_CARDS;

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(params.get('q') ?? '');
    });
  }

  results = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return { tracks: [] as Track[], playlists: [], artists: [] };
    return {
      tracks: TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q),
      ),
      playlists: PLAYLISTS.filter(
        (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      ),
      artists: ARTISTS.filter((a) => a.name.toLowerCase().includes(q)),
    };
  });
}
