import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './music.service';
import { Pager } from './admin.service';

export type ContactStatus = 'open' | 'resolved';

export interface ContactFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ContactReply {
  id: string;
  authorId: string;
  authorName: string;
  /** Written by an admin (not the contact's sender). */
  fromAdmin: boolean;
  text: string;
  files: ContactFile[];
  at: string;
}

export interface Contact {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  title: string;
  detail: string;
  files: ContactFile[];
  replies: ContactReply[];
  status: ContactStatus;
  createdAt: string;
  updatedAt?: string;
}

export const CONTACT_MAX_FILES = 5;
export const CONTACT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Contact requests (server/contacts.js): users send them, admins review them. */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private http = inject(HttpClient);

  send(title: string, detail: string, files: File[]): Promise<Contact> {
    const form = new FormData();
    form.append('title', title);
    form.append('detail', detail);
    for (const f of files) form.append('files', f, f.name);
    return firstValueFrom(this.http.post<Contact>(`${API_URL}/contacts`, form, { headers: this.headers() }));
  }

  /** Add a reply to an open contact; resolves to the updated contact. */
  reply(id: string, text: string, files: File[]): Promise<Contact> {
    const form = new FormData();
    form.append('text', text);
    for (const f of files) form.append('files', f, f.name);
    return firstValueFrom(
      this.http.post<Contact>(`${API_URL}/contacts/${encodeURIComponent(id)}/replies`, form, { headers: this.headers() }),
    );
  }

  mine(): Promise<Contact[]> {
    return firstValueFrom(this.http.get<Contact[]>(`${API_URL}/contacts/mine`, { headers: this.headers() }));
  }

  /** Admin: every user's contacts. */
  all(): Promise<Contact[]> {
    return firstValueFrom(this.http.get<Contact[]>(`${API_URL}/contacts`, { headers: this.headers() }));
  }

  setStatus(id: string, status: ContactStatus): Promise<Contact> {
    return firstValueFrom(
      this.http.patch<Contact>(`${API_URL}/contacts/${encodeURIComponent(id)}`, { status }, { headers: this.headers() }),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${API_URL}/contacts/${encodeURIComponent(id)}`, { headers: this.headers() }),
    );
  }

  /** Attachments need the auth header, so fetch the file and hand it to the browser as a download. */
  async download(contact: Contact, file: ContactFile): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(`${API_URL}/contacts/${encodeURIComponent(contact.id)}/files/${encodeURIComponent(file.id)}`, {
        headers: this.headers(),
        responseType: 'blob',
      }),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  messageOf(err: unknown): string {
    const e = err as { error?: { error?: string }; status?: number };
    if (e?.error?.error) return e.error.error;
    if (e?.status === 0) return 'Cannot reach the server. Is `npm run server` running?';
    return 'Something went wrong. Please try again.';
  }

  private headers(): Record<string, string> {
    const t = localStorage.getItem('music_online_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}

/** "12 KB", "3.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Search + status filter + sort + pages for a contact list (user page and admin tab). */
export class ContactListState extends Pager {
  readonly query = signal('');
  readonly status = signal<'all' | ContactStatus>('all');
  readonly sort = signal<'newest' | 'oldest'>('newest');

  /** `withSender` also searches the sender's name / email (admin). */
  apply(list: Contact[], withSender = false): Contact[] {
    const q = this.query().trim().toLowerCase();
    const status = this.status();
    const out = list.filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (!q) return true;
      const text = [
        c.title,
        c.detail,
        ...c.files.map((f) => f.name),
        ...(c.replies ?? []).flatMap((r) => [r.text, ...r.files.map((f) => f.name)]),
        ...(withSender ? [c.userName, c.userEmail ?? ''] : []),
      ];
      return text.join(' ').toLowerCase().includes(q);
    });
    const time = (c: Contact) => new Date(c.createdAt).getTime() || 0;
    return out.sort((a, b) => (this.sort() === 'newest' ? time(b) - time(a) : time(a) - time(b)));
  }

  resetPage(): void {
    this.page.set(1);
  }
}
