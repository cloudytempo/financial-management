import { Component } from '@angular/core';
import { CalendarWidget } from '../dashboard/widgets/calendar.widget';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-calendar', standalone: true, imports: [CalendarWidget, TranslatePipe],
  template: `<div class="page-head"><div><h1>{{ 'Calendar' | tr }}</h1><p class="sub">{{ 'Your events, bill due dates and installments in one place' | tr }}</p></div></div><app-calendar-widget [full]="true" />`,
})
export class CalendarComponent {}
