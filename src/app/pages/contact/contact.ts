import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ContactThread } from '../../components/contact-thread/contact-thread';
import {
  CONTACT_MAX_FILES,
  CONTACT_MAX_FILE_BYTES,
  Contact,
  ContactListState,
  ContactService,
  formatBytes,
} from '../../services/contact.service';

/** Send a contact (title, detail, optional files) and list the ones you sent. */
@Component({
  selector: 'app-contact',
  imports: [FormsModule, RouterLink, ContactThread],
  templateUrl: './contact.html',
})
export class ContactPage {
  auth = inject(AuthService);
  private contacts = inject(ContactService);

  maxFiles = CONTACT_MAX_FILES;
  bytes = formatBytes;

  // ---- Form ----
  title = signal('');
  detail = signal('');
  files = signal<File[]>([]);
  sending = signal(false);
  formError = signal<string | null>(null);
  sent = signal<string | null>(null);

  // ---- List ----
  list = signal<Contact[]>([]);
  loading = signal(true);
  listError = signal<string | null>(null);
  state = new ContactListState();
  openId = signal<string | null>(null);

  filtered = computed(() => this.state.apply(this.list()));
  rows = computed(() => this.state.slice(this.filtered()));

  constructor() {
    // Load once the session is known (it is restored asynchronously on refresh).
    effect(() => {
      if (this.auth.user()) untracked(() => void this.reload());
      else this.loading.set(false);
    });
  }

  async reload(): Promise<void> {
    try {
      this.listError.set(null);
      this.list.set(await this.contacts.mine());
    } catch (e) {
      this.listError.set(this.contacts.messageOf(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Add picked files (max 5, 10 MB each); the same file twice is ignored. */
  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = [...(input.files ?? [])];
    input.value = '';
    this.formError.set(null);
    const tooBig = picked.filter((f) => f.size > CONTACT_MAX_FILE_BYTES);
    if (tooBig.length) {
      this.formError.set(`${tooBig.map((f) => f.name).join(', ')}: each file must be 10 MB or smaller.`);
    }
    const next = [...this.files()];
    for (const f of picked) {
      if (f.size > CONTACT_MAX_FILE_BYTES) continue;
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= CONTACT_MAX_FILES) {
        this.formError.set(`Attach at most ${CONTACT_MAX_FILES} files.`);
        break;
      }
      next.push(f);
    }
    this.files.set(next);
  }

  removeFile(f: File): void {
    this.files.set(this.files().filter((x) => x !== f));
  }

  async send(): Promise<void> {
    this.formError.set(null);
    this.sent.set(null);
    const title = this.title().trim();
    const detail = this.detail().trim();
    if (!title || !detail) {
      this.formError.set('Title and detail are required.');
      return;
    }
    this.sending.set(true);
    try {
      const c = await this.contacts.send(title, detail, this.files());
      this.list.set([c, ...this.list()]);
      this.title.set('');
      this.detail.set('');
      this.files.set([]);
      this.sent.set(c.title);
      this.state.resetPage();
    } catch (e) {
      this.formError.set(this.contacts.messageOf(e));
    } finally {
      this.sending.set(false);
    }
  }

  toggle(c: Contact): void {
    this.openId.set(this.openId() === c.id ? null : c.id);
  }

  /** A reply was sent from the thread: swap in the updated contact. */
  onChanged(updated: Contact): void {
    this.list.set(this.list().map((c) => (c.id === updated.id ? updated : c)));
  }

  /** The latest message is the admin's: the user has something to read. */
  adminReplied(c: Contact): boolean {
    const last = c.replies?.at(-1);
    return c.status === 'open' && !!last?.fromAdmin;
  }

  dateOf(c: Contact): string {
    const d = new Date(c.createdAt);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  /** Filters changed: back to page 1. */
  onFilter(): void {
    this.state.resetPage();
  }
}
