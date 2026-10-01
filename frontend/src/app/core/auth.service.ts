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
  adminToken = signal<string | null>(localStorage.getItem('admin_token'));
  adminUser = signal<any>(JSON.parse(localStorage.getItem('admin_user') || 'null'));

  login(email: string, password: string) {
    return this.http.post<any>('/api/auth/login', { email, password }).pipe(tap((r) => { if (!r.reactivationRequired) this.set(r); }));
  }
  reactivate(token: string, password: string) {
    return this.http.post<any>('/api/auth/reactivate', { token, password }).pipe(tap((r) => this.set(r)));
  }
  adminLogin(email: string, password: string) {
    return this.http.post<any>('/api/admin-auth/login', { email, password }).pipe(tap((r) => this.setAdmin(r)));
  }
  signup(name: string, email: string, password: string, householdMode: 'create' | 'join', householdName: string, householdPassword: string, householdId?: string, householdAddress?: string) {
    return this.http.post<any>('/api/auth/signup', { name, email, password, householdMode, householdName, householdId, householdPassword, householdAddress }).pipe(tap((r) => this.set(r)));
  }
  resetPassword(email: string, password: string) {
    return this.http.post<any>('/api/auth/reset-password', { email, password });
  }
  households() { return this.http.get<any[]>('/api/auth/households'); }
  householdMembers() { return this.http.get<any[]>('/api/auth/households/members'); }
  householdActivity() { return this.http.get<any[]>('/api/auth/households/activity'); }
  complaintCategories() { return this.http.get<string[]>('/api/auth/households/members/complaint-categories'); }
  removeMember(id: number, ban: boolean, reason: string) { return this.http.post('/api/auth/households/members/' + id + '/remove', { ban, reason }); }
  updateHouseholdPassword(password: string) { return this.http.put('/api/auth/households/password', { password }); }
  updateHouseholdAddress(address: string) {
    return this.http.put<any>('/api/auth/households/address', { address }).pipe(tap((r) => this.setHousehold({ ...this.user()?.household, address: r.address })));
  }
  updateProfile(profile: { phone: string; bio: string; birthday: string | null }) { return this.http.put('/api/auth/profile', profile); }
  notifications() { return this.http.get<any[]>('/api/auth/notifications'); }
  markNotificationRead(id: number) { return this.http.post('/api/auth/notifications/' + id + '/read', {}); }
  markAllNotificationsRead() { return this.http.post('/api/auth/notifications/read-all', {}); }
  enterHousehold(householdId: string, password: string) {
    return this.http.post<any>('/api/auth/households/enter', { householdId, password }).pipe(tap((household) => this.setHousehold(household)));
  }
  createHousehold(name: string, password: string, address?: string) {
    return this.http.post<any>('/api/auth/households', { name, password, address }).pipe(tap((household) => this.setHousehold(household)));
  }
  private setHousehold(household: any) {
    const user = { ...this.user(), household };
    localStorage.setItem('user', JSON.stringify(user));
    this.user.set(user);
  }
  private set(r: any) {
    localStorage.setItem('token', r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    this.token.set(r.token); this.user.set(r.user);
  }
  private setAdmin(r: any) {
    localStorage.setItem('admin_token', r.token);
    localStorage.setItem('admin_user', JSON.stringify(r.user));
    this.adminToken.set(r.token); this.adminUser.set(r.user);
  }
  logout() {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    this.token.set(null); this.user.set(null);
    this.router.navigate(['/login']);
  }
  logoutAdmin() {
    localStorage.removeItem('admin_token'); localStorage.removeItem('admin_user');
    this.adminToken.set(null); this.adminUser.set(null);
    this.router.navigate(['/admin/login']);
  }
  requireHouseholdSelection() {
    const user = this.user();
    if (!user) return;
    const updated = { ...user, household: null };
    localStorage.setItem('user', JSON.stringify(updated));
    this.user.set(updated);
    this.router.navigate(['/settings']);
  }
}

export const authGuard: CanActivateFn = (_, state) => {
  const auth = inject(Auth), router = inject(Router);
  if (!auth.token()) return router.createUrlTree(['/login']);
  if (!auth.user()?.household && state.url !== '/settings') return router.createUrlTree(['/settings']);
  return true;
};
export const adminGuard: CanActivateFn = () => (inject(Auth).adminToken() ? true : inject(Router).createUrlTree(['/admin/login']));
export const adminLoginGuard: CanActivateFn = () => (inject(Auth).adminToken() ? inject(Router).createUrlTree(['/admin/dashboard']) : true);

// Only attaches the token to our own API (never to third-party calls such as prayer times).
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const adminApi = req.url.startsWith('/api/admin/');
  const t = adminApi ? auth.adminToken() : auth.token();
  const r = t && req.url.startsWith('/api') ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(r).pipe(catchError((e) => {
    if (e.status === 401 && adminApi) auth.logoutAdmin();
    else if (e.status === 401 && !req.url.includes('/auth/')) auth.logout();
    else if (e.status === 409 && e.error?.error === 'Choose an active household to continue.') auth.requireHouseholdSelection();
    return throwError(() => e);
  }));
};
