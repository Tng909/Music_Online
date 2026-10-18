import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Only `role === 'artist'` may enter /studio — everyone else goes home. */
export const artistGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.user()?.role === 'artist') return true;
  void router.navigate(['/']);
  return false;
};
