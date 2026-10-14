import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.html',
})
export class Signup {
  auth = inject(AuthService);
  private router = inject(Router);

  name = signal('');
  email = signal('');
  password = signal('');
  error = signal<string | null>(null);

  constructor() {
    if (this.auth.user()) void this.router.navigate(['/']);
  }

  /** Single step: validate all fields, then create the account. AuthService navigates home on success. */
  async submit(): Promise<void> {
    this.error.set(null);
    this.auth.clearError();
    if (!this.name().trim()) {
      this.error.set('Enter your name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (this.password().length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (!(await this.auth.signup(this.name().trim(), this.email().trim(), this.password()))) {
      this.error.set(this.auth.error());
    }
  }
}
