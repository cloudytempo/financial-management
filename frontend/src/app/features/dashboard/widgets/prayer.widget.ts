import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IconComponent } from '../../../shared/icon.component';
import { Language } from '../../../core/language.service';
import { TranslatePipe } from '../../../shared/translate.pipe';

const NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

@Component({
  selector: 'app-prayer-widget', standalone: true, imports: [IconComponent, TranslatePipe],
  template: `
  <div class="prayer-widget" [class.card]="framed">
    <div class="card-h"><h2><app-icon name="moon" [size]="18" />{{ 'Prayer times' | tr }}</h2><span class="muted small">{{ place }}</span></div>
    @if (error) { <div class="err">{{ error | tr }}</div> }
    <div class="prayer">
      @for (n of names; track n) { <div [class.next]="next === n">{{ n | tr }}<b>{{ times[n] || '--:--' }}</b></div> }
    </div>
  </div>`,
})
export class PrayerWidget implements OnInit, OnDestroy {
  @Input() framed = true;
  private http = inject(HttpClient); private language = inject(Language);
  names = NAMES; times: any = {}; next = ''; place = this.language.text('Locating…'); error = ''; private timer: any;

  ngOnInit() {
    const fallback = () => this.load(3.139, 101.6869, this.language.text('Kuala Lumpur (default location)'));
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => this.load(p.coords.latitude, p.coords.longitude, this.language.text('Your current location')), fallback, { timeout: 6000 });
    this.timer = setInterval(() => this.mark(), 60000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  load(lat: number, lng: number, label: string) {
    const d = new Date();
    const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    // method 17 = JAKIM (Malaysia); change if you prefer another authority
    this.http.get<any>(`https://api.aladhan.com/v1/timings/${date}?latitude=${lat}&longitude=${lng}&method=17`).subscribe({
      next: (r) => {
        NAMES.forEach((n) => (this.times[n] = (r.data.timings[n] || '').slice(0, 5)));
        this.place = `${label} · ${r.data.meta.timezone}`; this.mark();
      },
      error: () => { this.place = label; this.error = this.language.text('Could not load prayer times. Check your internet connection.'); },
    });
  }
  mark() {
    const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
    const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    this.next = NAMES.filter((n) => n !== 'Sunrise').find((n) => this.times[n] && mins(this.times[n]) > cur) || 'Fajr';
  }
}
