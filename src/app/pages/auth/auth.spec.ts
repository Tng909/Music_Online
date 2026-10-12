/**
 * @vitest-environment jsdom
 */
import '@angular/compiler'; // JIT compiler for raw vitest runs
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { ensureTestEnvironment } from '../../../testing/setup';

await ensureTestEnvironment();

describe('Sign up page', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Signup],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders the sign up form', () => {
    const fixture = TestBed.createComponent(Signup);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Sign up to start listening');
    expect(el.textContent).toContain('Email address');
    expect(el.querySelector('input[type="email"]')).toBeTruthy();
    expect(el.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Next');
    expect(el.textContent).toContain('or');
    expect(el.textContent).toContain('Sign up with phone number');
    expect(el.textContent).toContain('Sign up with Google');
    expect(el.textContent).toContain('Sign up with Apple');
    expect(el.textContent).toContain('Already have an account?');
    expect(el.querySelector('a[href="/login"]')?.textContent).toContain('Log in');
  });
});

describe('Log in page', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders the log in form', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Welcome back');
    expect(el.textContent).toContain('Email');
    expect(el.querySelector('input[type="email"]')).toBeTruthy();
    expect(el.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Continue');
    expect(el.textContent).toContain('or');
    expect(el.textContent).toContain('Continue with phone number');
    expect(el.textContent).toContain('Continue with Google');
    expect(el.textContent).toContain('Continue with Facebook');
    expect(el.textContent).toContain('Continue with Apple');
    expect(el.textContent).toContain("Don't have an account?");
    expect(el.querySelector('a[href="/signup"]')?.textContent).toContain('Sign up');
  });
});
