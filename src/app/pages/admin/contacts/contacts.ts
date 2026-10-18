import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Contact, ContactListState, ContactService } from '../../../services/contact.service';
import { ContactThread } from '../../../components/contact-thread/contact-thread';

/** Admin: every contact users sent — search, status filter, pages; resolve / reopen / delete. */
@Component({
  selector: 'app-admin-contacts',
  imports: [FormsModule, ContactThread],
  templateUrl: './contacts.html',
})
export class AdminContacts {
  private contacts = inject(ContactService);

  state = new ContactListState();
  list = signal<Contact[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  openId = signal<string | null>(null);
  /** Contact waiting for the inline "Delete?" confirmation. */
  confirmDeleteId = signal<string | null>(null);
  busyId = signal<string | null>(null);

  filtered = computed(() => this.state.apply(this.list(), true));
  rows = computed(() => this.state.slice(this.filtered()));
  openCount = computed(() => this.list().filter((c) => c.status === 'open').length);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.error.set(null);
      this.list.set(await this.contacts.all());
    } catch (e) {
      this.error.set(this.contacts.messageOf(e));
    } finally {
      this.loading.set(false);
    }
  }

  onFilter(): void {
    this.state.resetPage();
  }

  toggle(c: Contact): void {
    this.openId.set(this.openId() === c.id ? null : c.id);
    this.confirmDeleteId.set(null);
  }

  async setStatus(c: Contact, status: Contact['status']): Promise<void> {
    this.busyId.set(c.id);
    try {
      const updated = await this.contacts.setStatus(c.id, status);
      this.list.set(this.list().map((x) => (x.id === c.id ? updated : x)));
    } catch (e) {
      this.error.set(this.contacts.messageOf(e));
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(c: Contact): Promise<void> {
    this.busyId.set(c.id);
    try {
      await this.contacts.remove(c.id);
      this.list.set(this.list().filter((x) => x.id !== c.id));
      this.openId.set(null);
      this.confirmDeleteId.set(null);
      this.state.clamp(this.filtered().length);
    } catch (e) {
      this.error.set(this.contacts.messageOf(e));
    } finally {
      this.busyId.set(null);
    }
  }

  /** A reply was sent from the thread: swap in the updated contact. */
  onChanged(updated: Contact): void {
    this.list.set(this.list().map((c) => (c.id === updated.id ? updated : c)));
  }

  /** Open, and the latest message is the user's (no admin answer yet). */
  needsReply(c: Contact): boolean {
    const last = c.replies?.at(-1);
    return c.status === 'open' && (!last || !last.fromAdmin);
  }

  dateOf(c: Contact): string {
    const d = new Date(c.createdAt);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }
}
