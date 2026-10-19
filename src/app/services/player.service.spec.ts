import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatTime } from '../data/music-data';
import { ARTISTS, PLAYLISTS, TRACKS } from '../../testing/fixtures';
import { PlayerService } from './player.service';

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(203)).toBe('3:23');
  });
});

describe('music data', () => {
  it('has playlists that each contain tracks', () => {
    expect(PLAYLISTS.length).toBeGreaterThan(0);
    for (const p of PLAYLISTS) expect(p.tracks.length).toBeGreaterThan(0);
  });

  it('only references tracks that exist', () => {
    const ids = new Set(TRACKS.map((t) => t.id));
    for (const p of PLAYLISTS) for (const t of p.tracks) expect(ids.has(t.id)).toBe(true);
  });

  it('has artists', () => {
    expect(ARTISTS.length).toBeGreaterThan(0);
  });
});

describe('PlayerService', () => {
  let player: PlayerService;

  beforeEach(() => {
    player = new PlayerService();
    player.setLibrary(TRACKS); // radio fallback pool
  });

  afterEach(() => player.destroy());

  it('starts with no track and paused', () => {
    expect(player.currentTrack()).toBeNull();
    expect(player.isPlaying()).toBe(false);
  });

  it('plays a track and toggles playback', () => {
    player.playTrack(TRACKS[0], TRACKS);
    expect(player.currentTrack()?.id).toBe('t1');
    expect(player.isPlaying()).toBe(true);
    player.toggle();
    expect(player.isPlaying()).toBe(false);
  });

  it('advances to next and back to previous', () => {
    player.playTrack(TRACKS[0], TRACKS);
    player.next();
    expect(player.currentTrack()?.id).toBe('t2');
    player.prev();
    expect(player.currentTrack()?.id).toBe('t1');
  });

  it('manual next always advances even when repeat is one', () => {
    const queue = TRACKS.slice(0, 3);
    player.playTrack(queue[0], queue);
    player.cycleRepeat(); // all
    player.cycleRepeat(); // one
    expect(player.repeatMode()).toBe('one');
    player.next();
    expect(player.currentTrack()?.id).toBe(queue[1].id);
  });

  it('auto-advance with repeat one restarts the same song', () => {
    const queue = TRACKS.slice(0, 3);
    player.playTrack(queue[0], queue);
    player.cycleRepeat();
    player.cycleRepeat();
    player.seekTo(10);
    player.handleTrackEnd();
    expect(player.currentTrack()?.id).toBe(queue[0].id);
    expect(player.progress()).toBe(0);
    expect(player.isPlaying()).toBe(true);
  });

  it('auto-advance with repeat all loops the queue', () => {
    const queue = TRACKS.slice(0, 2);
    player.playTrack(queue[1], queue);
    player.cycleRepeat(); // all
    player.handleTrackEnd();
    expect(player.currentTrack()?.id).toBe(queue[0].id);
  });

  it('queue end with repeat off plays a different random song (radio)', () => {
    const queue = TRACKS.slice(0, 2);
    player.playTrack(queue[1], queue);
    expect(player.repeatMode()).toBe('off');
    player.handleTrackEnd();
    expect(player.isPlaying()).toBe(true);
    expect(player.currentTrack()?.id).not.toBe(queue[1].id);
    expect(player.progress()).toBe(0);
  });

  it('manual next at queue end also falls into radio', () => {
    const queue = TRACKS.slice(0, 2);
    player.playTrack(queue[1], queue);
    player.next();
    expect(player.currentTrack()?.id).not.toBe(queue[1].id);
  });

  it('lists the rest of a playlist under "Next from" and keeps the source while advancing', () => {
    const queue = TRACKS.slice(0, 3);
    const source = { type: 'playlist' as const, id: 'p1', name: 'My Mix' };
    player.playTrack(queue[0], queue, source);
    expect(player.nextFromSource().map((t) => t.id)).toEqual([queue[1].id, queue[2].id]);
    expect(player.nextUp()).toEqual([]);
    player.next();
    expect(player.queueSource()).toEqual(source);
    expect(player.nextFromSource().map((t) => t.id)).toEqual([queue[2].id]);
  });

  it('shows only "Next up" once the source queue is used up, and radio plays the first listed song', () => {
    const queue = TRACKS.slice(0, 2);
    player.playTrack(queue[1], queue, { type: 'artist', id: 'a1', name: 'Someone' });
    expect(player.nextFromSource()).toEqual([]);
    const upcoming = player.nextUp()[0];
    expect(upcoming).toBeDefined();
    player.handleTrackEnd();
    expect(player.currentTrack()?.id).toBe(upcoming.id);
    expect(player.queueSource()).toBeNull();
  });

  it('plays without a source show the rest of the queue under "Next up"', () => {
    const queue = TRACKS.slice(0, 3);
    player.playTrack(queue[0], queue);
    expect(player.nextFromSource()).toEqual([]);
    expect(player.nextUp().slice(0, 2).map((t) => t.id)).toEqual([queue[1].id, queue[2].id]);
  });

  it('records recently played songs, most recent first', () => {
    player.playTrack(TRACKS[0], TRACKS);
    player.next();
    player.playTrack(TRACKS[0], TRACKS);
    expect(player.recentlyPlayed().map((t) => t.id)).toEqual([TRACKS[0].id, TRACKS[1].id]);
  });

  it('clamps seeks to the track duration', () => {
    player.playTrack(TRACKS[0], TRACKS);
    player.seekTo(9999);
    expect(player.progress()).toBe(TRACKS[0].duration);
    player.seekTo(-5);
    expect(player.progress()).toBe(0);
  });

  it('toggles liked songs', () => {
    expect(player.isLiked('t2')).toBe(false);
    player.toggleLike('t2');
    expect(player.isLiked('t2')).toBe(true);
    player.toggleLike('t2');
    expect(player.isLiked('t2')).toBe(false);
  });

  it('persists liked songs across reloads', () => {
    const store = new Map<string, string>();
    const localStorageStub = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageStub,
      configurable: true,
      writable: true,
    });
    try {
      const first = new PlayerService();
      first.toggleLike('t3');
      expect(first.isLiked('t3')).toBe(true);
      expect(store.size).toBeGreaterThan(0);
      first.destroy();

      const second = new PlayerService();
      expect(second.isLiked('t3')).toBe(true);
      expect(second.likedCount()).toBeGreaterThanOrEqual(1);
      second.toggleLike('t3');
      expect(second.isLiked('t3')).toBe(false);
      second.destroy();
    } finally {
      delete (globalThis as Record<string, unknown>)['localStorage'];
    }
  });

  it('cycles repeat modes off -> all -> one -> off', () => {
    expect(player.repeatMode()).toBe('off');
    player.cycleRepeat();
    expect(player.repeatMode()).toBe('all');
    player.cycleRepeat();
    expect(player.repeatMode()).toBe('one');
    player.cycleRepeat();
    expect(player.repeatMode()).toBe('off');
  });

  it('clamps volume and unmutes on set', () => {
    player.setVolume(150);
    expect(player.volume()).toBe(100);
    player.setVolume(-10);
    expect(player.volume()).toBe(0);
    player.setVolume(40);
    expect(player.volume()).toBe(40);
    expect(player.isMuted()).toBe(false);
  });
});

describe('PlayerService synced lyrics', () => {
  let player: PlayerService;

  beforeEach(() => {
    player = new PlayerService();
    player.setLibrary(TRACKS);
  });

  afterEach(() => player.destroy());

  it('shows nothing before the first lyric time', () => {
    const track = { ...TRACKS[0], lyrics: [{ time: 5, text: 'Hello' }] };
    player.playTrack(track, [track]);
    expect(player.currentLyricLine()).toBeNull();
    expect(player.lyrics()).toEqual([{ time: 5, text: 'Hello' }]);
  });

  it('shows the lyric line matching the playback position', () => {
    const track = { ...TRACKS[0], lyrics: [{ time: 0, text: 'First' }, { time: 12, text: 'Second' }] };
    player.playTrack(track, [track]);
    expect(player.currentLyricLine()?.text).toBe('First');
    player.seekTo(12);
    expect(player.currentLyricLine()?.text).toBe('Second');
    player.seekTo(0);
    expect(player.currentLyricLine()?.text).toBe('First');
  });

  it('returns null for tracks without lyrics', () => {
    const track = { ...TRACKS[0] };
    delete track.lyrics;
    player.playTrack(track, TRACKS);
    expect(player.currentLyricLine()).toBeNull();
    expect(player.lyrics()).toBeNull();
  });

  it('clears the lyric when the track changes', () => {
    const withLyrics = { ...TRACKS[0], lyrics: [{ time: 0, text: 'Hey' }] };
    player.playTrack(withLyrics, [withLyrics]);
    expect(player.currentLyricLine()?.text).toBe('Hey');
    player.next();
    expect(player.currentLyricLine()).toBeNull();
  });
});

describe('PlayerService media session (earbuds / hardware keys)', () => {
  const handlers: Record<string, (details?: Record<string, unknown>) => void> = {};
  let metadata: { title: string; artist: string; album: string } | null = null;
  let playbackState = '';

  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    metadata = null;
    playbackState = '';

    // Minimal navigator.mediaSession + MediaMetadata fake (jsdom has neither).
    (navigator as unknown as Record<string, unknown>)['mediaSession'] = {
      setActionHandler(action: string, fn: (details?: Record<string, unknown>) => void) {
        handlers[action] = fn;
      },
      set playbackState(v: string) {
        playbackState = v;
      },
      set metadata(m: { title: string; artist: string; album: string }) {
        metadata = m;
      },
    };
    (globalThis as unknown as Record<string, unknown>)['MediaMetadata'] = class {
      constructor(init: { title: string; artist: string; album: string }) {
        Object.assign(this, init);
      }
    };
  });

  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>)['mediaSession'];
    delete (globalThis as unknown as Record<string, unknown>)['MediaMetadata'];
  });

  it('registers handlers for play/pause/next/prev', () => {
    new PlayerService();
    expect(typeof handlers['play']).toBe('function');
    expect(typeof handlers['pause']).toBe('function');
    expect(typeof handlers['nexttrack']).toBe('function');
    expect(typeof handlers['previoustrack']).toBe('function');
  });

  it('earbud play/pause buttons toggle the player', () => {
    const player = new PlayerService();
    player.playTrack(TRACKS[0], TRACKS);
    expect(player.isPlaying()).toBe(true);

    handlers['pause']?.();
    expect(player.isPlaying()).toBe(false);

    handlers['play']?.();
    expect(player.isPlaying()).toBe(true);
  });

  it('earbud next/prev buttons change the track', () => {
    const player = new PlayerService();
    player.playTrack(TRACKS[0], TRACKS);

    handlers['nexttrack']?.();
    expect(player.currentTrack()?.id).toBe(TRACKS[1].id);

    handlers['previoustrack']?.();
    expect(player.currentTrack()?.id).toBe(TRACKS[0].id);
  });

  it('publishes track metadata and playback state', () => {
    const player = new PlayerService();
    player.playTrack(TRACKS[0], TRACKS);

    expect(playbackState).toBe('playing');
    expect(metadata?.title).toBe(TRACKS[0].title);
    expect(metadata?.artist).toBe(TRACKS[0].artist);

    player.toggle();
    expect(playbackState).toBe('paused');
  });
});
