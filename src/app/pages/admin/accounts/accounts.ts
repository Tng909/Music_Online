import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTabState, AdminUser, AdminRole } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-accounts',
  imports: [FormsModule],
  templateUrl: './accounts.html',
})
export class AdminAccounts {
  private admin = inject(AdminService);

  state = new AdminTabState();
  roleFilter = signal<'all' | AdminRole>('all');
  users = signal<AdminUser[]>([]);
  error = signal<string | null>(null);
  loading = signal(true);

  roles: AdminRole[] = ['user', 'artist', 'admin'];

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.error.set(null);
      this.users.set(await this.admin.listUsers());
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    } finally {
      this.loading.set(false);
    }
  }

  filtered = computed(() => {
    const q = this.state.query().trim().toLowerCase();
    let list = this.users();
    if (this.roleFilter() !== 'all') list = list.filter((u) => (u.role || 'user') === this.roleFilter());
    if (q) {
      list = list.filter(
        (u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  rows = computed(() => this.state.slice(this.filtered()));

  roleOf(u: AdminUser): AdminRole {
    return u.role || 'user';
  }

  joinedOf(u: AdminUser): string {
    const d = new Date(u.createdAt);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  async setRole(u: AdminUser, role: AdminRole): Promise<void> {
    if (this.roleOf(u) === role) return;
    try {
      const updated = await this.admin.setUserRole(u.id, role);
      this.users.set(this.users().map((x) => (x.id === u.id ? updated : x)));
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }

  async remove(u: AdminUser): Promise<void> {
    if (!confirm(`Delete account "${u.email}"?`)) return;
    try {
      await this.admin.deleteUser(u.id);
      this.users.set(this.users().filter((x) => x.id !== u.id));
      this.state.clamp(this.filtered().length);
    } catch (e) {
      this.error.set(this.admin.messageOf(e));
    }
  }
}
