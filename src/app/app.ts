import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './components/sidebar/sidebar';
import { Topbar } from './components/topbar/topbar';
import { Playerbar } from './components/playerbar/playerbar';

@Component({
  imports: [RouterOutlet, Sidebar, Topbar, Playerbar],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
