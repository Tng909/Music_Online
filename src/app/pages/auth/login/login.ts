import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  auth = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  password = signal('');
  error = signal<string | null>(null);

  constructor() {
    if (this.auth.user()) void this.router.navigate(['/']);
  }

  /** Single step: validate both fields, then log in. AuthService navigates home on success. */
  async submit(): Promise<void> {
    this.error.set(null);
    this.auth.clearError();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (!this.password()) {
      this.error.set('Enter your password.');
      return;
    }
    if (!(await this.auth.login(this.email().trim(), this.password()))) {
      this.error.set(this.auth.error());
    }
  }
}
