import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  token = signal<string | null>(localStorage.getItem('token'));
  user = signal<any>(JSON.parse(localStorage.getItem('user') || 'null'));

  login(email: string, password: string) {
    return this.http.post<any>('/api/auth/login', { email, password }).pipe(tap((r) => this.set(r)));
  }
  signup(name: string, email: string, password: string) {
    return this.http.post<any>('/api/auth/signup', { name, email, password }).pipe(tap((r) => this.set(r)));
  }
  resetPassword(email: string, password: string) {
    return this.http.post<any>('/api/auth/reset-password', { email, password });
  }
  private set(r: any) {
    localStorage.setItem('token', r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    this.token.set(r.token); this.user.set(r.user);
  }
  logout() {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    this.token.set(null); this.user.set(null);
    this.router.navigate(['/login']);
  }
}

export const authGuard: CanActivateFn = () => (inject(Auth).token() ? true : inject(Router).createUrlTree(['/login']));

// Only attaches the token to our own API (never to third-party calls such as prayer times).
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const t = auth.token();
  const r = t && req.url.startsWith('/api') ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(r).pipe(catchError((e) => {
    if (e.status === 401 && !req.url.includes('/auth/')) auth.logout();
    return throwError(() => e);
  }));
};
