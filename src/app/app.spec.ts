/**
 * @vitest-environment jsdom
 */
import '@angular/compiler'; // JIT compiler for raw vitest runs
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Topbar } from './components/topbar/topbar';
import { AuthService, AuthUser } from './services/auth.service';
import { ensureTestEnvironment } from '../testing/setup';

await ensureTestEnvironment();

const USER: AuthUser = {
  id: 'u1',
  email: 'demo@music.online',
  name: 'Minh',
  provider: 'email',
  createdAt: '2026-10-12T00:00:00.000Z',
};

describe('App', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the sidebar, topbar and player', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-sidebar')).toBeTruthy();
    expect(el.querySelector('app-topbar')).toBeTruthy();
    expect(el.querySelector('app-playerbar')).toBeTruthy();
  });

  it('should offer Sign up and Log in in the top bar', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const topbar = (fixture.nativeElement as HTMLElement).querySelector('app-topbar')!;
    expect(topbar.querySelector('a[href="/signup"]')?.textContent).toContain('Sign up');
    expect(topbar.querySelector('a[href="/login"]')?.textContent).toContain('Log in');
  });
});

describe('Topbar account menu', () => {
  function createTopbar(user: AuthUser | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AuthService, useValue: { user: () => user, logout: () => Promise.resolve() } },
      ],
    });
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('opens the menu with Account and Log out when the avatar is clicked', () => {
    const fixture = createTopbar(USER);
    const el = fixture.nativeElement as HTMLElement;

    // Dropdown is closed to start.
    expect(el.querySelector('[role="menu"]')).toBeNull();

    // Avatar is the trigger.
    const trigger = el.querySelector('button[title="Your account"]') as HTMLButtonElement;
    expect(trigger.textContent?.trim()).toBe('M');

    trigger.click();
    fixture.detectChanges();

    const menu = el.querySelector('[role="menu"]')!;
    expect(menu).toBeTruthy();
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim());
    expect(items).toEqual(['Account', 'Contact', 'Log out']);
  });

  it('no longer shows the name, Install App, or an inline Log out button', () => {
    const fixture = createTopbar(USER);
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('button[title="Your account"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Install App');
    // Exactly one Log out control, and it lives inside the dropdown.
    const logout = [...el.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Log out');
    expect(logout).toHaveLength(1);
    expect(logout[0].closest('[role="menu"]')).toBeTruthy();
  });

  it('closes the menu when clicking outside', () => {
    const fixture = createTopbar(USER);
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('button[title="Your account"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="menu"]')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });
});

