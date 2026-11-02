import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../shared/translate.pipe';

@Injectable({ providedIn: 'root' })
export class Loading {
  private requests = signal(0);
  isLoading = computed(() => this.requests() > 0);

  start() { this.requests.update((count) => count + 1); }
  finish() { this.requests.update((count) => Math.max(0, count - 1)); }
}

@Component({
  selector: 'app-loading-overlay', standalone: true, imports: [TranslatePipe],
  template: `@if (loading.isLoading()) { <div class="loading-overlay" role="status" aria-live="polite"><span class="loading-spinner"></span>{{ 'Please wait…' | tr }}</div> }`,
})
export class LoadingOverlayComponent { loading = inject(Loading); }

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(Loading);
  loading.start();
  return next(req).pipe(finalize(() => loading.finish()));
};