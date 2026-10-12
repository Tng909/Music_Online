import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { AuthOptions } from '../../../components/auth-options/auth-options';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink, AuthOptions],
  templateUrl: './signup.html',
})
export class Signup {
  auth = inject(AuthService);
  private router = inject(Router);

  step = signal<'email' | 'password'>('email');
  email = signal('');
  password = signal('');
  error = signal<string | null>(null);

  constructor() {
    if (this.auth.user()) void this.router.navigate(['/']);
  }

  /** Step 1: validate the email format, then reveal the password field. */
  next(): void {
    this.error.set(null);
    this.auth.clearError();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    this.step.set('password');
  }

  back(): void {
    this.error.set(null);
    this.step.set('email');
  }

  /** Step 2: create the account. AuthService navigates home on success. */
  async submit(): Promise<void> {
    this.error.set(null);
    if (this.password().length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (!(await this.auth.signup(this.email().trim(), this.password()))) {
      this.error.set(this.auth.error());
    }
  }
}
