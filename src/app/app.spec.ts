/**
 * @vitest-environment jsdom
 *
 * Works under both runners:
 * - `ng test` — Angular's builder pre-compiles templates and inits TestBed.
 * - raw `npx vitest` — we init TestBed and load templateUrls from disk here.
 */
import '@angular/compiler'; // JIT compiler for raw vitest runs
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app';

const testBed = getTestBed() as unknown as { platform: unknown };

if (!testBed.platform) {
  // ---- raw vitest mode ----
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

  // Map './sidebar.html' → '<project>/src/app/components/sidebar/sidebar.html'
  const templateByBasename = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.html')) templateByBasename.set(entry, full);
    }
  };
  walk(join(process.cwd(), 'src'));

  await resolveComponentResources(async (url: string) => {
    const basename = url.split(/[\\/]/).pop() ?? url;
    const file = templateByBasename.get(basename);
    if (!file) throw new Error(`Template not found for raw vitest run: ${url}`);
    return readFileSync(file, 'utf8');
  });
}

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
});
