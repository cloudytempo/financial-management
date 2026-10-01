import { Component, inject } from '@angular/core';
import { Language } from '../../core/language.service';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-admin-settings', standalone: true, imports: [TranslatePipe],
  template: `
  <div class="page-head"><div><p class="admin-kicker">{{ 'HOMINT OPERATIONS' | tr }}</p><h1>{{ 'Settings' | tr }}</h1></div></div>
  <section class="card admin-settings-panel" aria-labelledby="admin-language-title">
    <h2 id="admin-language-title">{{ 'Language' | tr }}</h2><p class="sub">{{ 'Choose your language' | tr }}</p>
    <div class="seg" role="group" [attr.aria-label]="'Language' | tr" style="margin-top:.75rem">
      <button type="button" [class.on]="language.code() === 'en'" (click)="language.set('en')">{{ 'English' | tr }}</button>
      <button type="button" [class.on]="language.code() === 'ms'" (click)="language.set('ms')">{{ 'Bahasa Melayu' | tr }}</button>
    </div>
  </section>`,
})
export class AdminSettingsComponent { language = inject(Language); }
