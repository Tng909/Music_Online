import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Initializes the Angular test environment when running under raw `vitest`.
 * Under `ng test` this is a no-op: the Angular builder has already initialized
 * TestBed and pre-compiled every `templateUrl`.
 *
 * Call at the top level of a spec file, AFTER importing the components under
 * test (component imports populate Angular's template resolution queue).
 */
export async function ensureTestEnvironment(): Promise<void> {
  const testBed = getTestBed() as unknown as { platform: unknown };
  if (testBed.platform) return;

  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

  // Collect every template in the project: './sidebar.html' → absolute path.
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
