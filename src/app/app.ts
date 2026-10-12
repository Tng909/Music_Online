import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Sidebar } from './components/sidebar/sidebar';
import { Topbar } from './components/topbar/topbar';
import { Playerbar } from './components/playerbar/playerbar';

const AUTH_PATHS = ['/login', '/signup'];

@Component({
  imports: [RouterOutlet, Sidebar, Topbar, Playerbar],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  private router = inject(Router);

  /** Login / sign up pages render full-screen, without sidebar, topbar or player. */
  readonly isAuthRoute = signal(App.isAuthUrl(window.location.pathname));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.isAuthRoute.set(App.isAuthUrl(e.urlAfterRedirects)));
  }

  private static isAuthUrl(url: string): boolean {
    return AUTH_PATHS.some((p) => url === p || url.startsWith(`${p}/`));
  }
}
