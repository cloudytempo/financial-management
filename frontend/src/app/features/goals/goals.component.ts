import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg, fmt } from '../../shared/util';

@Component({
  selector: 'app-goals', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent],
  template: `
  <div class="page-head">
    <div><h1>Goals</h1><p class="sub">Save towards what matters and keep it moving</p></div>
    <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />Add goal</button>
  </div>

  @if (reminders.length) {
    <div class="alert"><app-icon name="bell" /><div><b>Goals that need attention</b>
      <ul>@for (g of reminders; track g.id) {
        <li>{{ g.name }}: @if (g.stale) { no progress update for {{ g.months_since_update }} months }
          @if (g.stale && g.overdue) { and } @if (g.overdue) { target date {{ g.target_date }} has passed }</li>
      }</ul></div></div>
  }

  @if (items.length) {
  <div class="bento">
    <div class="card s4"><div class="card-h"><h2><app-icon name="check" [size]="18" />Completion status</h2></div>@if (statusCfg) { <app-chart [config]="statusCfg" /> }</div>
    <div class="card s8"><div class="card-h"><h2><app-icon name="target" [size]="18" />Progress by goal (%)</h2></div>@if (progressCfg) { <app-chart [config]="progressCfg" /> }</div>
  </div> } @else { <div class="card empty">No goals yet. Add one to start tracking.</div> }

  <div class="cards">
  @for (g of items; track g.id) {
    <div class="card">
      <div class="row between" style="flex-wrap:nowrap">
        <div class="row" style="flex-wrap:nowrap;min-width:0"><span class="ic-badge" [class.brown]="g.status === 'Ongoing'"><app-icon [name]="g.status === 'Complete' ? 'check' : 'target'" [size]="18" /></span>
          <div style="min-width:0"><div style="font-weight:700">{{ g.name }} <span class="badge" [class.ok]="g.status === 'Complete'">{{ g.status }}</span></div>
            <div class="muted small">Target {{ fmt(g.target_amount) }} by {{ g.target_date }} @if (g.overdue) { <span class="badge">Past date</span> }</div></div></div>
        <div class="row" style="flex-wrap:nowrap;gap:0"><button class="icon-btn" (click)="edit(g)" aria-label="Edit"><app-icon name="pencil" [size]="18" /></button>
          <button class="icon-btn del" (click)="remove(g)" aria-label="Delete"><app-icon name="trash" [size]="18" /></button></div>
      </div>
      <div class="row between small" style="margin:.7rem 0 .3rem"><span>{{ fmt(g.saved_amount) }} saved</span><b>{{ g.progress }}%</b></div>
      <div class="bar" [class.ok]="g.status === 'Complete'"><i [style.width.%]="g.progress"></i></div>
      @if (g.status === 'Ongoing') {
        <div class="muted small" style="margin-top:.5rem">Last progress update: {{ g.months_since_update < 1 ? 'less than a month ago' : g.months_since_update + ' month(s) ago' }}
          @if (g.stale) { <span class="badge">No change</span> }</div>
        <div class="row" style="margin-top:.7rem;flex-wrap:nowrap">
          <input type="number" inputmode="decimal" step="0.01" min="0" placeholder="New saved total (MYR)" aria-label="New saved total" [ngModel]="inputs[g.id]" (ngModelChange)="inputs[g.id] = $event">
          <button class="btn sm" (click)="updateSaved(g)">Update</button>
          <button class="btn green sm" (click)="complete(g)" title="Mark complete"><app-icon name="check" [size]="16" /></button>
        </div>
      }
    </div>
  }
  </div>

  <app-modal [open]="showForm" [title]="form.id ? 'Edit goal' : 'Add goal'" (closed)="closeForm()">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">Goal name<input name="name" [(ngModel)]="form.name" required></label>
        <label>Target amount (MYR)<input name="target" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="form.target_amount" required></label>
        <label>Saved so far (MYR)<input name="saved" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="form.saved_amount"></label>
        <label>Target date<input name="date" type="date" [(ngModel)]="form.target_date" required></label>
        <label>Status<select name="status" [(ngModel)]="form.status">@for (s of statuses; track s) { <option>{{ s }}</option> }</select></label>
      </div>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="closeForm()">Cancel</button><button type="submit" class="btn">{{ form.id ? 'Save changes' : 'Add goal' }}</button></div>
    </form>
  </app-modal>`,
})
export class GoalsComponent implements OnInit {
  private api = inject(Api);
  fmt = fmt; statuses = ['Ongoing', 'Complete']; showForm = false;
  items: any[] = []; reminders: any[] = []; inputs: Record<number, number> = {};
  form: any = this.blank(); error = ''; statusCfg: any; progressCfg: any;

  blank() {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return { id: null, name: '', target_amount: null, saved_amount: 0, target_date: d.toISOString().slice(0, 10), status: 'Ongoing' };
  }
  ngOnInit() { this.load(); }
  load() {
    this.api.get<any[]>('/goals').subscribe((r) => {
      this.items = r;
      const c = r.filter((g) => g.status === 'Complete').length;
      this.statusCfg = { type: 'doughnut', data: { labels: ['Complete', 'Ongoing'], datasets: [{ data: [c, r.length - c], backgroundColor: ['#66BB6A', '#5D4037'] }] } };
      this.progressCfg = { type: 'bar', data: { labels: r.map((g) => g.name), datasets: [{ label: 'Progress %', data: r.map((g) => g.progress), backgroundColor: r.map((g) => (g.status === 'Complete' ? '#66BB6A' : '#8D6E63')) }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } } };
    });
    this.api.get<any[]>('/goals/reminders').subscribe((r) => (this.reminders = r));
  }
  private put(g: any) { return this.api.put('/goals/' + g.id, g); }
  openForm() { this.form = this.blank(); this.error = ''; this.showForm = true; }
  closeForm() { this.showForm = false; this.error = ''; }
  edit(g: any) { this.form = { ...g }; this.error = ''; this.showForm = true; }
  save() {
    this.error = '';
    const f = this.form;
    const req = f.id ? this.put(f) : this.api.post('/goals', f);
    req.subscribe({ next: () => { this.closeForm(); this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  updateSaved(g: any) {
    const v = this.inputs[g.id];
    if (v == null || v < 0) return;
    this.put({ ...g, saved_amount: +v }).subscribe(() => { delete this.inputs[g.id]; this.load(); });
  }
  complete(g: any) { this.put({ ...g, status: 'Complete' }).subscribe(() => this.load()); }
  remove(g: any) { if (confirm(`Delete goal "${g.name}"?`)) this.api.del('/goals/' + g.id).subscribe(() => this.load()); }
}
