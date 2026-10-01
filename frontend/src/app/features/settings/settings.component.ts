import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../core/auth.service';
import { Api } from '../../core/api.service';
import { Theme } from '../../core/theme.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-settings', standalone: true, imports: [FormsModule, IconComponent, ModalComponent],
  template: `
  <div class="page-head"><div><h1>Settings</h1><p class="sub">Manage your household and workspace</p></div></div>
  <section class="card settings-panel" aria-labelledby="household-title" style="margin-bottom:1rem">
    <h2 id="household-title">Household</h2>
    <p class="sub">@if (auth.user()?.household?.name) { Currently using <b>{{ auth.user()?.household?.name }}</b>. } @else { No active household. Enter or create one to continue. }
      A household password is required each time you enter another household.</p>
    <div class="row" style="margin-top:1rem"><h3 style="margin:0">Members</h3><span class="pill">{{ members.length }}</span></div>
    @if (membersLoading) { <p class="muted small" style="margin-top:.5rem">Loading members...</p> }
    @else if (memberError) { <p class="err small" style="margin-top:.5rem">{{ memberError }}</p> }
    @else if (!members.length) { <p class="muted small" style="margin-top:.5rem">No members found.</p> }
    @else {
      <ul class="list" style="margin-top:.4rem">
        @for (member of members; track member.id) {
          <li class="item"><span class="ava">{{ member.name.charAt(0).toUpperCase() }}</span><span class="grow"><b>{{ member.name }}</b>
            @if (member.id === auth.user()?.id) { <span class="pill">You</span> }
            @if (member.is_owner) { <span class="pill">Owner</span> }</span>
            @if (member.id !== auth.user()?.id) { <button class="icon-btn" (click)="openReport(member)" [attr.aria-label]="'Report ' + member.name" title="Report member"><app-icon name="alert" /></button> }
          </li>
        }
      </ul>
    }
    @if (isOwner && otherMembers.length) {
      <div class="owner-transfer"><label>Transfer household ownership<select name="newOwner" [(ngModel)]="nextOwnerId">
        <option [ngValue]="null">Choose a member</option>@for (member of otherMembers; track member.id) { <option [ngValue]="member.id">{{ member.name }}</option> }
      </select></label><button class="btn ghost" type="button" [disabled]="!nextOwnerId" (click)="transferOwnership()">Transfer</button></div>
    }
    @if (memberActionError) { <div class="err small" style="margin-top:.5rem">{{ memberActionError }}</div> }
    @if (households.length) {
      <div class="seg" style="margin:1rem 0">
        @for (household of households; track household.id) {
          <button type="button" [class.on]="household.active" (click)="select(household.name)">{{ household.name }}</button>
        }
      </div>
    }
    <div class="seg" style="margin:1rem 0">
      <button type="button" [class.on]="householdMode === 'enter'" (click)="householdMode = 'enter'">Enter household</button>
      <button type="button" [class.on]="householdMode === 'create'" (click)="householdMode = 'create'">Create new</button>
    </div>
    <form (ngSubmit)="saveHousehold()">
      <div class="fields">
        <label>Household name<input name="householdName" [(ngModel)]="householdName" required autocomplete="organization"></label>
        <label>Household password<input name="householdPassword" type="password" [(ngModel)]="householdPassword" minlength="8" required autocomplete="current-password"></label>
      </div>
      @if (householdError) { <div class="err" style="margin-top:.6rem">{{ householdError }}</div> }
      <div style="margin-top:1rem"><button class="btn" type="submit">{{ householdMode === 'create' ? 'Create and enter' : 'Enter household' }}</button></div>
    </form>
  </section>
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
  </section>
  <app-modal [open]="showReport" [title]="'Report ' + reportTarget?.name" (closed)="showReport = false">
    <form (ngSubmit)="submitReport()"><label>Why should an admin review this member?
      <textarea name="reportReason" [(ngModel)]="reportReason" rows="4" minlength="10" maxlength="2000" required placeholder="Describe why you think this person does not belong in the household"></textarea></label>
      @if (memberActionError) { <div class="err" style="margin-top:.6rem">{{ memberActionError }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showReport = false">Cancel</button><button class="btn" type="submit">Send report</button></div>
    </form>
  </app-modal>`,
})
export class SettingsComponent implements OnInit {
  theme = inject(Theme); auth = inject(Auth); private api = inject(Api);
  households: any[] = []; members: any[] = []; membersLoading = true; memberError = ''; householdMode: 'enter' | 'create' = 'enter';
  householdName = ''; householdPassword = ''; householdError = '';
  nextOwnerId: number | null = null; memberActionError = ''; showReport = false; reportTarget: any = null; reportReason = '';
  get isOwner() { return this.members.some((member) => member.id === this.auth.user()?.id && member.is_owner); }
  get otherMembers() { return this.members.filter((member) => member.id !== this.auth.user()?.id); }
  ngOnInit() {
    this.auth.households().subscribe((rows) => (this.households = rows));
    this.auth.householdMembers().subscribe({
      next: (rows) => { this.members = rows; this.membersLoading = false; },
      error: () => { this.memberError = 'Could not load household members.'; this.membersLoading = false; },
    });
  }
  select(name: string) { this.householdMode = 'enter'; this.householdName = name; this.householdPassword = ''; }
  transferOwnership() {
    if (!this.nextOwnerId || !confirm('Transfer household ownership? You will no longer be the owner.')) return;
    this.memberActionError = '';
    this.api.post('/auth/households/owner', { user_id: this.nextOwnerId }).subscribe({
      next: () => { this.nextOwnerId = null; this.reloadMembers(); }, error: (e) => (this.memberActionError = errMsg(e)),
    });
  }
  openReport(member: any) { this.reportTarget = member; this.reportReason = ''; this.memberActionError = ''; this.showReport = true; }
  submitReport() {
    if (!this.reportTarget) return;
    this.memberActionError = '';
    this.api.post('/auth/households/members/' + this.reportTarget.id + '/report', { description: this.reportReason }).subscribe({
      next: () => { this.showReport = false; this.reportTarget = null; this.reportReason = ''; },
      error: (e) => (this.memberActionError = errMsg(e)),
    });
  }
  reloadMembers() {
    this.auth.householdMembers().subscribe({ next: (rows) => (this.members = rows), error: (e) => (this.memberActionError = errMsg(e)) });
  }
  saveHousehold() {
    this.householdError = '';
    const request = this.householdMode === 'create'
      ? this.auth.createHousehold(this.householdName, this.householdPassword)
      : this.auth.enterHousehold(this.householdName, this.householdPassword);
    request.subscribe({ next: () => window.location.reload(), error: (error) => (this.householdError = errMsg(error)) });
  }
}