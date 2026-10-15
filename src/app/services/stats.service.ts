import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from './music.service';

/** Fire-and-forget play events + heartbeats (admin dashboard stats). No-ops without HttpClient. */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private http = inject(HttpClient, { optional: true });

  /** Identifies this tab's player, so pausing or closing it removes exactly this listener. */
  private readonly clientId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  constructor() {
    // Closing or reloading the tab ends the listening session right away.
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.stop());
  }

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
    http.post(`${API_URL}/admin/stats/heartbeat`, { trackId, clientId: this.clientId }, { headers }).subscribe({
      error: () => undefined,
    });
  }

  /** Paused / closed: no longer listening. keepalive lets it finish during page unload. */
  stop(): void {
    if (typeof fetch === 'undefined') return;
    void fetch(`${API_URL}/admin/stats/stop`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId }),
    }).catch(() => undefined);
  }

  private static authHeaders(): Record<string, string> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('music_online_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
