import { Component } from '@angular/core';
import { CalendarWidget } from '../dashboard/widgets/calendar.widget';

@Component({
  selector: 'app-calendar', standalone: true, imports: [CalendarWidget],
  template: `<div class="page-head"><div><h1>Calendar</h1><p class="sub">Your events, bill due dates and installments in one place</p></div></div><app-calendar-widget [full]="true" />`,
})
export class CalendarComponent {}
