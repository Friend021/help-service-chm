import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IdpShellComponent } from './features/idp/idp-shell/idp-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`
    :host {
      display: block;
      height: 100vh;
    }
  `],
})
export class App {}