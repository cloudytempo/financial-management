import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class Loading {
  private requests = signal(0);
  isLoading = computed(() => this.requests() > 0);

  start() { this.requests.update((count) => count + 1); }
  finish() { this.requests.update((count) => Math.max(0, count - 1)); }
}

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(Loading);
  loading.start();
  return next(req).pipe(finalize(() => loading.finish()));
};