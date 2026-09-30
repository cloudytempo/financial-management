import { Component, inject } from '@angular/core';
import { Theme } from '../../core/theme.service';

@Component({
  selector: 'app-settings', standalone: true,
  template: `
  <div class="page-head"><div><h1>Settings</h1><p class="sub">Personalize your workspace</p></div></div>
  <section class="card settings-panel" aria-labelledby="appearance-title">
    <h2 id="appearance-title">Appearance</h2>
    <p class="sub">Choose a color theme</p>
    <div class="theme-options" role="group" aria-label="Color theme">
      <button class="theme-option" [attr.aria-pressed]="theme.name() === 'earth'" (click)="theme.set('earth')">
        <span class="theme-swatch earth" aria-hidden="true"></span><span><b>Earth</b><br><span class="muted small">Warm brown and green</span></span>
      </button>
      <button class="theme-option" [attr.aria-pressed]="theme.name() === 'sky'" (click)="theme.set('sky')">
        <span class="theme-swatch sky" aria-hidden="true"></span><span><b>Summer Sky</b><br><span class="muted small">Blue and bright yellow</span></span>
      </button>
    </div>
  </section>`,
})
export class SettingsComponent {
  theme = inject(Theme);
}