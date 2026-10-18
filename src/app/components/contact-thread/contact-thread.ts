import { Component, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CONTACT_MAX_FILES,
  CONTACT_MAX_FILE_BYTES,
  Contact,
  ContactFile,
  ContactReply,
  ContactService,
  formatBytes,
} from '../../services/contact.service';

/**
 * One contact's conversation: the first message, every reply, and a reply box
 * while the contact is open. Used on the Contact page (sender) and the admin tab.
 */
@Component({
  selector: 'app-contact-thread',
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './contact-thread.html',
})
export class ContactThread {
  private contacts = inject(ContactService);

  contact = input.required<Contact>();
  /** The viewer answers as an admin (their replies sit on the right). */
  asAdmin = input(false);
  /** Emits the contact after a reply was added. */
  changed = output<Contact>();

  maxFiles = CONTACT_MAX_FILES;
  bytes = formatBytes;

  text = signal('');
  files = signal<File[]>([]);
  sending = signal(false);
  error = signal<string | null>(null);

  /** The viewer's own messages are drawn on the right. */
  mine(r: ContactReply): boolean {
    return this.asAdmin() ? r.fromAdmin : !r.fromAdmin;
  }

  timeOf(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = [...(input.files ?? [])];
    input.value = '';
    this.error.set(null);
    const next = [...this.files()];
    for (const f of picked) {
      if (f.size > CONTACT_MAX_FILE_BYTES) {
        this.error.set(`${f.name}: each file must be 10 MB or smaller.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= CONTACT_MAX_FILES) {
        this.error.set(`Attach at most ${CONTACT_MAX_FILES} files.`);
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
    const text = this.text().trim();
    if (this.sending()) return;
    if (!text && !this.files().length) {
      this.error.set('Write a reply or attach a file.');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      const updated = await this.contacts.reply(this.contact().id, text, this.files());
      this.text.set('');
      this.files.set([]);
      this.changed.emit(updated);
    } catch (e) {
      this.error.set(this.contacts.messageOf(e));
    } finally {
      this.sending.set(false);
    }
  }

  async download(f: ContactFile): Promise<void> {
    try {
      await this.contacts.download(this.contact(), f);
    } catch (e) {
      this.error.set(this.contacts.messageOf(e));
    }
  }
}
