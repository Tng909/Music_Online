import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Only `role === 'admin'` may enter /admin — everyone else goes home. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (user && (user.role || 'user') === 'admin') return true;
  void router.navigate(['/']);
  return false;
};
