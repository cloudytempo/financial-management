import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-modal', standalone: true, imports: [IconComponent],
  template: `
  @if (open) {
    <div class="backdrop" (click)="closed.emit()">
      <div class="sheet" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="sheet-h"><h2>{{ title }}</h2>
          <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close"><app-icon name="x" /></button></div>
        <ng-content />
      </div>
    </div>
  }`,
})
export class ModalComponent {
  @Input() open = false; @Input() title = '';
  @Output() closed = new EventEmitter<void>();
  @HostListener('document:keydown.escape') esc() { if (this.open) this.closed.emit(); }
}
