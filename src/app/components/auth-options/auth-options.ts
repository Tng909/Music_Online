import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, SocialProvider } from '../../services/auth.service';

/**
 * Provider buttons shared by the login and sign up pages:
 * phone number (with demo code), Google, Apple and (log in only) Facebook.
 * On success AuthService navigates to the home page.
 */
@Component({
  selector: 'app-auth-options',
  imports: [FormsModule],
  templateUrl: './auth-options.html',
})
export class AuthOptions {
  auth = inject(AuthService);

  /**
   * 'signup' → "Sign up with …" labels (pic 2), 'login' → "Continue with …" (pic 3).
   * Decorator input (not signal `input()`) so it also resolves when the spec
   * runs under plain `vitest`, which has no AOT transform.
   */
  @Input() context: 'signup' | 'login' = 'login';


  view = signal<'buttons' | 'social' | 'phone' | 'code'>('buttons');
  provider = signal<SocialProvider | null>(null);
  socialEmail = signal('');
  phone = signal('');
  code = signal('');
  demoCode = signal('');
  localError = signal<string | null>(null);

  googleLabel(): string {
    return this.context === 'signup' ? 'Sign up with Google' : 'Continue with Google';
  }

  phoneLabel(): string {
    return this.context === 'signup' ? 'Sign up with phone number' : 'Continue with phone number';
  }

  appleLabel(): string {
    return this.context === 'signup' ? 'Sign up with Apple' : 'Continue with Apple';
  }

  openSocial(provider: SocialProvider): void {
    this.provider.set(provider);
    this.view.set('social');
    this.localError.set(null);
    this.auth.clearError();
  }

  async submitSocial(): Promise<void> {
    const email = this.socialEmail().trim();
    if (!this.isEmail(email)) {
      this.localError.set('Enter a valid email address.');
      return;
    }
    const provider = this.provider();
    if (!provider) return;
    if (!(await this.auth.social(provider, email))) this.localError.set(this.auth.error());
  }

  openPhone(): void {
    this.view.set('phone');
    this.localError.set(null);
    this.auth.clearError();
  }

  async sendCode(): Promise<void> {
    const phone = this.phone().trim();
    if (!phone) {
      this.localError.set('Enter your phone number.');
      return;
    }
    const code = await this.auth.startPhoneLogin(phone);
    if (code) {
      this.demoCode.set(code);
      this.view.set('code');
    } else {
      this.localError.set(this.auth.error());
    }
  }

  async verifyCode(): Promise<void> {
    if (!this.code().trim()) {
      this.localError.set('Enter the code.');
      return;
    }
    if (!(await this.auth.verifyPhone(this.phone().trim(), this.code().trim()))) {
      this.localError.set(this.auth.error());
    }
  }

  back(): void {
    this.view.set('buttons');
    this.localError.set(null);
    this.auth.clearError();
  }

  error(): string | null {
    return this.localError();
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
