import { Component, Input } from '@angular/core';
import { TranslatePipe } from './translate.pipe';

@Component({
  selector: 'app-skeleton', standalone: true, imports: [TranslatePipe],
  template: `
  <div class="skeleton-stack" [class.chart-skeleton]="variant === 'chart'" [class.kpi-skeleton]="variant === 'kpi'" role="status" [attr.aria-label]="'Loading' | tr" aria-live="polite">
    @if (variant === 'chart') {
      <span class="sk-chart-ring"></span><span class="sk-chart-line"></span><span class="sk-chart-line short"></span>
    } @else if (variant === 'kpi') {
      <span class="sk-kpi-icon"></span><span class="sk-lines"><i></i><b></b></span>
    } @else {
      @for (_ of lines; track $index) { <div class="sk-row"><span class="sk-avatar"></span><span class="sk-lines"><i></i><b></b></span><em></em></div> }
    }
  </div>`,
})
export class SkeletonComponent {
  @Input() rows = 3;
  @Input() variant: 'rows' | 'chart' | 'kpi' = 'rows';
  get lines() { return Array.from({ length: Math.max(1, this.rows) }); }
}
