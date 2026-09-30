import { Injectable, effect, signal } from '@angular/core';

export type ThemeName = 'earth' | 'sky';

@Injectable({ providedIn: 'root' })
export class Theme {
  name = signal<ThemeName>(localStorage.getItem('theme') === 'sky' ? 'sky' : 'earth');
  constructor() {
    document.documentElement.setAttribute('data-theme', this.name()); // apply before first paint
    effect(() => {
      const n = this.name();
      document.documentElement.setAttribute('data-theme', n);
      localStorage.setItem('theme', n);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', n === 'sky' ? '#061F9E' : '#3E2723');
    });
  }
  toggle() { this.name.update((n) => (n === 'earth' ? 'sky' : 'earth')); }
}
