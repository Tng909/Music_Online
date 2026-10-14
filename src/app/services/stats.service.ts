import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from './music.service';

/** Fire-and-forget play events + heartbeats (admin dashboard stats). No-ops without HttpClient. */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private http = inject(HttpClient, { optional: true });

  reportPlay(trackId: string): void {
    const http = this.http;
    if (!http) return;
    const headers = StatsService.authHeaders();
    http.post(`${API_URL}/admin/stats/play`, { trackId }, { headers }).subscribe({
      error: () => undefined, // stats must never break playback
    });
  }

  heartbeat(trackId: string): void {
    const http = this.http;
    if (!http) return;
    const headers = StatsService.authHeaders();
    http.post(`${API_URL}/admin/stats/heartbeat`, { trackId }, { headers }).subscribe({
      error: () => undefined,
    });
  }

  private static authHeaders(): Record<string, string> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('music_online_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
