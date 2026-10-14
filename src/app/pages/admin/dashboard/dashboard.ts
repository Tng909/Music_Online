import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, StatsOverview } from '../../../services/admin.service';

type Range = 'day' | 'week' | 'month' | 'year';

@Component({
  selector: 'app-admin-dashboard',
  imports: [FormsModule],
  templateUrl: './dashboard.html',
})
export class AdminDashboard {
  private admin = inject(AdminService);

  range = signal<Range>('week');
  stats = signal<StatsOverview | null>(null);
  live = signal<number | null>(null);
  error = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void this.load();
    this.timer = setInterval(() => void this.loadLive(), 5000);
    void this.loadLive();
  }

  async setRange(r: Range): Promise<void> {
    this.range.set(r);
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.error.set(null);
      this.stats.set(await this.admin.statsOverview(this.range()));
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }

  private async loadLive(): Promise<void> {
    try {
      const res = await this.admin.liveListeners();
      this.live.set(res.listeners);
    } catch {
      /* dashboard keeps last value when server is away */
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
