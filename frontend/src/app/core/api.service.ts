import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  get<T>(u: string) { return this.http.get<T>('/api' + u); }
  post<T>(u: string, b: any) { return this.http.post<T>('/api' + u, b); }
  put<T>(u: string, b: any) { return this.http.put<T>('/api' + u, b); }
  upload<T>(u: string, f: File) { return this.http.post<T>('/api' + u, f, { headers: { 'Content-Type': 'application/octet-stream' } }); }
  del(u: string) { return this.http.delete('/api' + u); }
}
