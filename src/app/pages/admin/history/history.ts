import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, HistoryItem } from '../../../services/admin.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-admin-history',
  imports: [FormsModule],
  templateUrl: './history.html',
})
export class AdminHistory {
  private admin = inject(AdminService);

  query = signal('');
  action = signal('');
  from = signal('');
  to = signal('');
  items = signal<HistoryItem[]>([]);
  total = signal(0);
  page = signal(1);
  pages = signal(1);
  error = signal<string | null>(null);
  loading = signal(true);

  actions = [
    'user.signup',
    'user.role',
    'user.delete',
    'song.create',
    'song.update',
    'song.delete',
    'artist.create',
    'artist.update',
    'artist.delete',
    'playlist.create',
    'playlist.update',
    'playlist.delete',
    'contact.create',
    'contact.reply',
    'contact.status',
    'contact.delete',
  ];

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.error.set(null);
      const res = await this.admin.history({
        q: this.query().trim(),
        action: this.action(),
        from: this.from(),
        to: this.to(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      });
      this.items.set(res.items);
      this.total.set(res.total);
      this.page.set(res.page);
      this.pages.set(res.pages);
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    } finally {
      this.loading.set(false);
    }
  }

  onFilter(): void {
    this.page.set(1);
    void this.reload();
  }

  prev(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      void this.reload();
    }
  }

  next(): void {
    if (this.page() < this.pages()) {
      this.page.set(this.page() + 1);
      void this.reload();
    }
  }

  goTo(raw: string): void {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    this.page.set(Math.max(1, Math.min(this.pages(), n)));
    void this.reload();
  }

  timeOf(h: HistoryItem): string {
    const d = new Date(h.at);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }
}
