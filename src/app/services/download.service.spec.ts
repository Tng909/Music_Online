/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  DOWNLOAD_STORAGE_KEY,
  DownloadService,
  downloadFileName,
} from './download.service';
import type { Track } from '../data/music-data';
import { ensureTestEnvironment } from '../../testing/setup';

await ensureTestEnvironment();

const WITH_FILE: Track = {
  id: 's1',
  title: 'Billie Jean',
  artist: 'Michael Jackson',
  album: 'Thriller',
  duration: 294,
  plays: '1.4B',
  gradient: 'from-zinc-700 to-zinc-950',
  emoji: '🕺',
  coverUrl: '/covers/BillieJean.jpg',
  audioUrl: '/audio/Billie Jean_spotdown.org.mp3',
};

const SIMULATED: Track = {
  id: 't1',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  album: 'After Hours',
  duration: 203,
  plays: '4.2B',
  gradient: 'from-rose-500 to-orange-400',
  emoji: '🌃',
  audioUrl: null,
};

/** jsdom lacks URL.createObjectURL/revokeObjectURL — stub them. */
function stubObjectUrls(): void {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  }
}

function mockFetchOk(): void {
  stubObjectUrls();
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(new Blob(['fake-mp3-bytes']), { status: 200 })),
  );
}

describe('downloadFileName', () => {
  it('builds a safe "Artist - Title.mp3" filename', () => {
    expect(downloadFileName(WITH_FILE)).toBe('Michael Jackson - Billie Jean.mp3');
    expect(
      downloadFileName({ title: 'a/b:c*d?e"f<g>h|i', artist: 'x/y' }),
    ).toBe('xy - abcdefghi.mp3');
  });
});

describe('DownloadService', () => {
  let svc: DownloadService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    svc = TestBed.inject(DownloadService);
    svc.resetForTests();
    vi.restoreAllMocks();
    mockFetchOk();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('starts with empty history', () => {
    expect(svc.history()).toEqual([]);
    expect(svc.count()).toBe(0);
  });

  it('canDownload only when the track has an audio file', () => {
    expect(svc.canDownload(WITH_FILE)).toBe(true);
    expect(svc.canDownload(SIMULATED)).toBe(false);
  });

  it('downloads the file and records it in history', async () => {
    const ok = await svc.download(WITH_FILE);
    expect(ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(encodeURI(WITH_FILE.audioUrl!));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    expect(svc.isDownloaded('s1')).toBe(true);
    expect(svc.count()).toBe(1);
    const [rec] = svc.history();
    expect(rec.title).toBe('Billie Jean');
    expect(rec.downloadedAt).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(DOWNLOAD_STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('s1');
  });

  it('re-downloading the same song bumps it to the top without duplicates', async () => {
    await svc.download(WITH_FILE);
    await svc.download({ ...WITH_FILE, title: WITH_FILE.title });
    expect(svc.count()).toBe(1);
    expect(svc.history()[0].id).toBe('s1');
  });

  it('refuses tracks without an audio file and surfaces an error', async () => {
    const ok = await svc.download(SIMULATED);
    expect(ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(svc.history()).toEqual([]);
    expect(svc.error()).toContain('No audio file available');
  });

  it('reports HTTP failures without recording history', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    const ok = await svc.download(WITH_FILE);
    expect(ok).toBe(false);
    expect(svc.history()).toEqual([]);
    expect(svc.error()).toContain('404');
  });

  it('removes and clears history entries', async () => {
    await svc.download(WITH_FILE);
    await svc.download({ ...WITH_FILE, id: 's2', title: 'Other', artist: 'Other Artist' });
    expect(svc.count()).toBe(2);
    svc.remove('s1');
    expect(svc.count()).toBe(1);
    expect(svc.isDownloaded('s1')).toBe(false);
    svc.clear();
    expect(svc.count()).toBe(0);
    expect(localStorage.getItem(DOWNLOAD_STORAGE_KEY)).toBe('[]');
  });
});
