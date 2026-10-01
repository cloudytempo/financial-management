import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, shareReplay, tap, throwError } from 'rxjs';
import { Auth } from './auth.service';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private cache = new Map<string, { expiresAt: number; response: Observable<unknown> }>();
  private readonly cacheTtl = 15_000;

  get<T>(u: string): Observable<T> {
    const isAdmin = u.startsWith('/admin/');
    const token = isAdmin ? this.auth.adminToken() : this.auth.token();
    const identity = isAdmin ? this.auth.adminUser()?.id : `${this.auth.user()?.id}:${this.auth.user()?.household?.id ?? ''}`;
    const key = `${identity}:${token}:${u}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.response as Observable<T>;

    let response: Observable<T>;
    response = this.http.get<T>('/api' + u).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((error) => { this.cache.delete(key); return throwError(() => error); }),
    );
    this.cache.set(key, { expiresAt: Date.now() + this.cacheTtl, response });
    return response;
  }

  private invalidate<T>(request: Observable<T>) {
    this.cache.clear();
    return request.pipe(tap(() => this.cache.clear()));
  }

  post<T>(u: string, b: any) { return this.invalidate(this.http.post<T>('/api' + u, b)); }
  put<T>(u: string, b: any) { return this.invalidate(this.http.put<T>('/api' + u, b)); }
  upload<T>(u: string, f: File) { return this.invalidate(this.http.post<T>('/api' + u, f, { headers: { 'Content-Type': 'application/octet-stream' } })); }
  del(u: string) { return this.invalidate(this.http.delete('/api' + u)); }
}
