import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARTISTS, PLAYLISTS, TRACKS, formatTime } from '../data/music-data';
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
