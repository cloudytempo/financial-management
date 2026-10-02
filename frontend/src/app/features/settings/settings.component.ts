import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Auth } from '../../core/auth.service';
import { Api } from '../../core/api.service';
import { Theme } from '../../core/theme.service';
import { Language } from '../../core/language.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/translate.pipe';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { errMsg } from '../../shared/util';
import { renderMarkdown } from '../../shared/markdown';

@Component({
  selector: 'app-settings', standalone: true, imports: [FormsModule, IconComponent, ModalComponent, TranslatePipe, SkeletonComponent],
  template: `
  <div class="page-head"><div><h1>{{ 'Settings' | tr }}</h1><p class="sub">{{ 'Manage your household and workspace' | tr }}</p></div></div>
  <div class="settings-grid">
  <div class="settings-col">
  <section class="card settings-panel" aria-labelledby="household-title">
    <h2 id="household-title">{{ 'Household' | tr }}</h2>
    @if (auth.user()?.household?.name) {
      <p class="sub">{{ 'Currently using' | tr }} <b>{{ auth.user()?.household?.name }}</b>.
        {{ 'A household password is required each time you enter another household.' | tr }}</p>
      <div class="row between" style="flex-wrap:wrap;gap:.6rem;margin-top:.6rem">
        <span class="pill">{{ 'Household ID' | tr }}: <b>{{ auth.user()?.household?.public_id }}</b></span>
        <button type="button" class="btn ghost sm" (click)="copyInviteId()"><app-icon name="copy" [size]="14" />{{ (copied ? 'Copied!' : 'Copy invite ID') | tr }}</button>
      </div>
      <p class="muted small" style="margin-top:.4rem">{{ 'Share this ID (and your household password) to invite others to join.' | tr }}</p>
      <div style="margin-top:.8rem">
        <label>{{ 'Household address' | tr }}
          <div class="row" style="flex-wrap:nowrap">
            <input name="householdAddress" [(ngModel)]="addressInput" [placeholder]="'Add an address' | tr" [disabled]="!isOwner">
            @if (isOwner) { <button type="button" class="btn sm" (click)="saveAddress()">{{ 'Save' | tr }}</button> }
          </div>
        </label>
        @if (auth.user()?.household?.address) { <a class="btn ghost sm" style="margin-top:.4rem" [href]="mapUrl(auth.user()?.household?.address)" target="_blank" rel="noopener"><app-icon name="map-pin" [size]="14" />{{ 'Open in map' | tr }}</a> }
      </div>
    } @else { <p class="sub">{{ 'No active household. Enter or create one to continue.' | tr }}</p> }

    <div class="row" style="margin-top:1rem"><h3 style="margin:0">{{ 'Occupants' | tr }}</h3><span class="pill">{{ members.length }}</span></div>
    @if (membersLoading) { <app-skeleton [rows]="3" /> }
    @else if (memberError) { <p class="err small" style="margin-top:.5rem">{{ memberError | tr }}</p> }
    @else if (!members.length) { <p class="muted small" style="margin-top:.5rem">{{ 'No members found.' | tr }}</p> }
    @else {
      <ul class="list" style="margin-top:.4rem">
        @for (member of members; track member.id) {
          <li class="item"><span class="ava">{{ member.name.charAt(0).toUpperCase() }}</span><span class="grow"><b>{{ member.name }}</b>
            @if (member.id === auth.user()?.id) { <span class="pill">{{ 'You' | tr }}</span> }
            @if (member.is_owner) { <span class="pill">{{ 'Owner' | tr }}</span> }
            <br><span class="muted small">{{ member.email }}@if (member.phone) { · {{ member.phone }} }@if (member.birthday) { · 🎂 {{ member.birthday }} }</span></span>
            @if (member.id !== auth.user()?.id) { <button class="icon-btn" (click)="openAction(member)" [attr.aria-label]="('Report or manage member' | tr) + ' ' + member.name" [title]="'Report or manage member' | tr"><app-icon name="alert" /></button> }
          </li>
        }
      </ul>
    }
    @if (isOwner && otherMembers.length) {
      <div class="owner-transfer"><label>{{ 'Transfer household ownership' | tr }}<select name="newOwner" [(ngModel)]="nextOwnerId">
        <option [ngValue]="null">{{ 'Choose a member' | tr }}</option>@for (member of otherMembers; track member.id) { <option [ngValue]="member.id">{{ member.name }}</option> }
      </select></label><button class="btn ghost" type="button" [disabled]="!nextOwnerId" (click)="transferOwnership()">{{ 'Transfer' | tr }}</button></div>
    }
    @if (isOwner) {
      <form (ngSubmit)="savePassword()" style="margin-top:1rem">
        <label>{{ 'New household password' | tr }}
          <div class="pw-field"><input name="newHouseholdPassword" [type]="showNewHouseholdPassword ? 'text' : 'password'" [(ngModel)]="newHouseholdPassword" minlength="8" autocomplete="off" placeholder="••••••••">
            <button type="button" class="pw-toggle" (click)="showNewHouseholdPassword = !showNewHouseholdPassword" [attr.aria-label]="(showNewHouseholdPassword ? 'Hide password' : 'Show password') | tr"><app-icon [name]="showNewHouseholdPassword ? 'eye-off' : 'eye'" [size]="16" /></button></div>
        </label>
        @if (passwordError) { <div class="err small" style="margin-top:.4rem">{{ passwordError | tr }}</div> }
        <button class="btn ghost sm" type="submit" style="margin-top:.4rem">{{ 'Update household password' | tr }}</button>
      </form>
    }
    @if (memberActionError && !showAction) { <div class="err small" style="margin-top:.5rem">{{ memberActionError | tr }}</div> }
    @if (households.length) {
      <div class="seg" style="margin:1rem 0">
        @for (household of households; track household.id) {
          <button type="button" [class.on]="household.active" (click)="select(household)">{{ household.name }}</button>
        }
      </div>
    }
    <div class="seg" style="margin:1rem 0">
      <button type="button" [class.on]="householdMode === 'enter'" (click)="householdMode = 'enter'">{{ 'Enter household' | tr }}</button>
      <button type="button" [class.on]="householdMode === 'create'" (click)="householdMode = 'create'">{{ 'Create new' | tr }}</button>
    </div>
    <form (ngSubmit)="saveHousehold()">
      <input type="text" name="username" autocomplete="username" class="autofill-decoy" tabindex="-1" aria-hidden="true">
      <input type="password" name="password" autocomplete="current-password" class="autofill-decoy" tabindex="-1" aria-hidden="true">
      <div class="fields">
        @if (householdMode === 'create') {
          <label>{{ 'Household name' | tr }}<input name="householdName" [(ngModel)]="householdName" required autocomplete="organization"></label>
          <label>{{ 'Household address (optional)' | tr }}<input name="householdAddress2" [(ngModel)]="householdAddress"></label>
        } @else {
          <label>{{ 'Household ID' | tr }}<input name="householdIdEntry" [(ngModel)]="householdId" required autocomplete="off" [placeholder]="'Ask the owner for the household ID' | tr"></label>
        }
        <label>{{ 'Household password' | tr }}
          <div class="pw-field"><input name="householdPassword" [type]="showHouseholdPassword ? 'text' : 'password'" [(ngModel)]="householdPassword" minlength="8" required autocomplete="off">
            <button type="button" class="pw-toggle" (click)="showHouseholdPassword = !showHouseholdPassword" [attr.aria-label]="(showHouseholdPassword ? 'Hide password' : 'Show password') | tr"><app-icon [name]="showHouseholdPassword ? 'eye-off' : 'eye'" [size]="16" /></button></div>
        </label>
      </div>
      @if (householdError) { <div class="err" style="margin-top:.6rem">{{ householdError | tr }}</div> }
      <div style="margin-top:1rem"><button class="btn" type="submit">{{ (householdMode === 'create' ? 'Create and enter' : 'Enter household') | tr }}</button></div>
    </form>
  </section>

  <section class="card settings-panel" aria-labelledby="report-title">
    <h2 id="report-title">{{ 'Detailed report' | tr }}</h2>
    <p class="sub">{{ 'Generate a readable financial report covering income, expenses, budgets, bills, installments and goals for this household.' | tr }}</p>
    @if (reportError) { <div class="err small" style="margin-top:.5rem">{{ reportError | tr }}</div> }
    <button class="btn" type="button" style="margin-top:.6rem" [disabled]="reportLoading" (click)="generateReport()">{{ (reportLoading ? 'Generating…' : 'Generate report') | tr }}</button>
  </section>

  <section class="card settings-panel" aria-labelledby="language-title">
    <h2 id="language-title">{{ 'Language' | tr }}</h2><p class="sub">{{ 'Choose your language' | tr }}</p>
    <div class="seg" role="group" [attr.aria-label]="'Language' | tr" style="margin-top:.75rem">
      <button type="button" [class.on]="language.code() === 'en'" (click)="language.set('en')">{{ 'English' | tr }}</button>
      <button type="button" [class.on]="language.code() === 'ms'" (click)="language.set('ms')">{{ 'Bahasa Melayu' | tr }}</button>
    </div>
  </section>
  </div>

  <div class="settings-col">
  <section class="card settings-panel" aria-labelledby="profile-title">
    <h2 id="profile-title">{{ 'My profile' | tr }}</h2>
    <form (ngSubmit)="saveProfile()">
      <div class="fields">
        <label>{{ 'Phone number' | tr }}<input name="profilePhone" [(ngModel)]="profile.phone" maxlength="30"></label>
        <label>{{ 'Birthday' | tr }}<input name="profileBirthday" type="date" [(ngModel)]="profile.birthday"></label>
        <label class="full">{{ 'About you' | tr }}<textarea name="profileBio" [(ngModel)]="profile.bio" rows="3" maxlength="500"></textarea></label>
      </div>
      <p class="muted small">{{ 'Your birthday is shown on the shared household calendar once saved.' | tr }}</p>
      @if (profileError) { <div class="err" style="margin-top:.6rem">{{ profileError | tr }}</div> }
      @if (profileSaved) { <div class="okmsg" style="margin-top:.6rem">{{ 'Profile saved.' | tr }}</div> }
      <div style="margin-top:1rem"><button class="btn" type="submit">{{ 'Save profile' | tr }}</button></div>
    </form>
  </section>

  <section class="card settings-panel" aria-labelledby="appearance-title">
    <h2 id="appearance-title">{{ 'Appearance' | tr }}</h2>
    <p class="sub">{{ 'Choose a color theme' | tr }}</p>
    <div class="theme-options" role="group" [attr.aria-label]="'Color theme' | tr">
      <button class="theme-option" [attr.aria-pressed]="theme.name() === 'earth'" (click)="theme.set('earth')">
        <span class="theme-swatch earth" aria-hidden="true"></span><span><b>Earth</b><br><span class="muted small">{{ 'Warm brown and green' | tr }}</span></span>
      </button>
      <button class="theme-option" [attr.aria-pressed]="theme.name() === 'sky'" (click)="theme.set('sky')">
        <span class="theme-swatch sky" aria-hidden="true"></span><span><b>Summer Sky</b><br><span class="muted small">{{ 'Blue and bright yellow' | tr }}</span></span>
      </button>
    </div>
  </section>

  <section class="card settings-panel settings-activity-card" aria-labelledby="activity-title">
    <div class="row between"><h2 id="activity-title" style="margin:0">{{ 'Recent activity' | tr }}</h2><button class="icon-btn" (click)="loadActivity()" [attr.aria-label]="'Refresh' | tr"><app-icon name="refresh" /></button></div>
    <div class="settings-activity-scroll">
      @if (activityLoading) { <app-skeleton [rows]="4" /> }
      @else if (!activity.length) { <p class="muted small" style="margin-top:.5rem">{{ 'No activity yet.' | tr }}</p> }
      @else {
        <ol class="admin-timeline" style="margin-top:.5rem">@for (event of activity; track event.id) {
          <li><span class="timeline-marker" aria-hidden="true"></span>
            <div class="timeline-entry"><div class="row between"><b>{{ activityLabel(event) | tr }}</b><time class="muted small">{{ dateTime(event.created_at) }}</time></div>
              <div class="s">{{ event.actor_name }}@if (event.subject_name) { · {{ event.subject_name }} }</div></div></li>
        }</ol>
      }
    </div>
  </section>
  </div>
  </div>

  <app-modal [open]="showAction" [title]="('Manage' | tr) + ' ' + actionTarget?.name" (closed)="showAction = false">
    <form (ngSubmit)="submitAction()">
      <label>{{ 'What is this about?' | tr }}<select name="actionCategory" [(ngModel)]="actionCategory">
        @for (category of categories; track category) { <option [value]="category">{{ category | tr }}</option> }
        @if (isOwner) { <option value="Invalid Member">{{ 'Invalid Member' | tr }}</option> }
      </select></label>
      @if (actionCategory === 'Invalid Member') {
        <div class="action-invalid-panel">
          <p class="muted small">{{ 'Remove this person from the household. You can also ban them from rejoining.' | tr }}</p>
          <label class="row" style="flex-wrap:nowrap"><input type="checkbox" name="banMember" [(ngModel)]="removeBan"> {{ 'Also ban this person from rejoining this household' | tr }}</label>
          <label>{{ 'Reason (optional)' | tr }}<textarea name="removeReason" [(ngModel)]="removeReason" rows="3" maxlength="500" [placeholder]="'Why is this member being removed?' | tr"></textarea></label>
        </div>
      } @else {
        <label>{{ 'Why should an admin review this member?' | tr }}
          <textarea name="reportReason" [(ngModel)]="reportReason" rows="4" minlength="10" maxlength="2000" required [placeholder]="'Describe why you think this person does not belong in the household' | tr"></textarea></label>
      }
      @if (memberActionError) { <div class="err" style="margin-top:.6rem">{{ memberActionError | tr }}</div> }
      <div class="sheet-f">
        <button type="button" class="btn ghost" (click)="showAction = false">{{ 'Cancel' | tr }}</button>
        @if (actionCategory === 'Invalid Member') { <button class="btn danger" type="submit">{{ (removeBan ? 'Ban and remove' : 'Remove member') | tr }}</button> }
        @else { <button class="btn" type="submit">{{ 'Send report' | tr }}</button> }
      </div>
    </form>
  </app-modal>

  <app-modal [open]="showReportModal" [title]="'Household financial report' | tr" (closed)="showReportModal = false">
    <div class="report-modal-body" [innerHTML]="reportHtml"></div>
    <div class="sheet-f">
      <button type="button" class="btn ghost" (click)="showReportModal = false">{{ 'Close' | tr }}</button>
      <button type="button" class="btn" (click)="downloadReportMarkdown()">{{ 'Download as Markdown' | tr }}</button>
    </div>
  </app-modal>`,
})
export class SettingsComponent implements OnInit {
  theme = inject(Theme); auth = inject(Auth); language = inject(Language); private api = inject(Api); private sanitizer = inject(DomSanitizer);
  households: any[] = []; members: any[] = []; membersLoading = true; memberError = ''; householdMode: 'enter' | 'create' = 'enter';
  householdName = ''; householdId = ''; householdAddress = ''; householdPassword = ''; householdError = ''; addressInput = '';
  nextOwnerId: number | null = null; memberActionError = '';
  categories: string[] = ['Harassment', 'Inappropriate behavior', 'Financial dispute', 'Property damage', 'Rule violation', 'Other'];
  showAction = false; actionTarget: any = null; actionCategory = 'Other'; reportReason = ''; removeBan = false; removeReason = '';
  newHouseholdPassword = ''; passwordError = ''; copied = false; showNewHouseholdPassword = false; showHouseholdPassword = false;
  activity: any[] = []; activityLoading = true;
  profile: any = { phone: '', birthday: '', bio: '' }; profileError = ''; profileSaved = false;
  reportLoading = false; reportError = ''; showReportModal = false; reportMarkdown = ''; reportHtml: any = '';
  get isOwner() { return this.members.some((member) => member.id === this.auth.user()?.id && member.is_owner); }
  get otherMembers() { return this.members.filter((member) => member.id !== this.auth.user()?.id); }
  ngOnInit() {
    this.auth.households().subscribe((rows) => (this.households = rows));
    this.reloadMembers();
    this.loadActivity();
    this.auth.complaintCategories().subscribe({ next: (rows) => { if (rows.length) this.categories = rows; }, error: () => {} });
    this.addressInput = this.auth.user()?.household?.address || '';
    this.auth.getProfile().subscribe({
      next: (p) => (this.profile = { phone: p.phone || '', birthday: p.birthday || '', bio: p.bio || '' }),
      error: (e) => (this.profileError = errMsg(e)),
    });
  }
  select(household: any) { this.householdMode = 'enter'; this.householdId = household.public_id; this.householdPassword = ''; }
  mapUrl(address: string) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address); }
  copyInviteId() {
    const id = this.auth.user()?.household?.public_id;
    if (!id) return;
    navigator.clipboard?.writeText(id).then(() => { this.copied = true; setTimeout(() => (this.copied = false), 2000); });
  }
  saveAddress() {
    this.auth.updateHouseholdAddress(this.addressInput).subscribe({ next: () => {}, error: (e) => (this.memberActionError = errMsg(e)) });
  }
  savePassword() {
    this.passwordError = '';
    if ((this.newHouseholdPassword || '').length < 8) { this.passwordError = 'Household password must be at least 8 characters.'; return; }
    this.auth.updateHouseholdPassword(this.newHouseholdPassword).subscribe({ next: () => { this.newHouseholdPassword = ''; }, error: (e) => (this.passwordError = errMsg(e)) });
  }
  transferOwnership() {
    if (!this.nextOwnerId || !confirm('Transfer household ownership? You will no longer be the owner.')) return;
    this.memberActionError = '';
    this.api.post('/auth/households/owner', { user_id: this.nextOwnerId }).subscribe({
      next: () => { this.nextOwnerId = null; this.reloadMembers(); }, error: (e) => (this.memberActionError = errMsg(e)),
    });
  }
  openAction(member: any) {
    this.actionTarget = member; this.actionCategory = 'Other'; this.reportReason = ''; this.removeBan = false; this.removeReason = '';
    this.memberActionError = ''; this.showAction = true;
  }
  submitAction() {
    if (!this.actionTarget) return;
    this.memberActionError = '';
    if (this.actionCategory === 'Invalid Member') {
      this.auth.removeMember(this.actionTarget.id, this.removeBan, this.removeReason).subscribe({
        next: () => { this.showAction = false; this.actionTarget = null; this.reloadMembers(); },
        error: (e) => (this.memberActionError = errMsg(e)),
      });
      return;
    }
    this.api.post('/auth/households/members/' + this.actionTarget.id + '/report', { description: this.reportReason, category: this.actionCategory }).subscribe({
      next: () => { this.showAction = false; this.actionTarget = null; this.reportReason = ''; },
      error: (e) => (this.memberActionError = errMsg(e)),
    });
  }
  reloadMembers() {
    this.membersLoading = true;
    this.auth.householdMembers().subscribe({ next: (rows) => { this.members = rows; this.membersLoading = false; }, error: (e) => { this.memberError = errMsg(e); this.membersLoading = false; } });
  }
  loadActivity() {
    this.activityLoading = true;
    this.auth.householdActivity().subscribe({ next: (rows) => { this.activity = rows; this.activityLoading = false; }, error: () => { this.activityLoading = false; } });
  }
  activityLabel(event: any) {
    if (event.activity_type === 'module_action') return `${event.details?.module || 'Module'} ${(event.details?.method || '').toLowerCase()} update`;
    return String(event.activity_type).replaceAll('_', ' ').replace(/^./, (letter: string) => letter.toUpperCase());
  }
  dateTime(value: string) { return new Date(value).toLocaleString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY'); }
  saveProfile() {
    this.profileError = ''; this.profileSaved = false;
    this.auth.updateProfile(this.profile).subscribe({
      next: () => { this.profileSaved = true; setTimeout(() => (this.profileSaved = false), 2500); },
      error: (e) => (this.profileError = errMsg(e)),
    });
  }
  saveHousehold() {
    this.householdError = '';
    const request = this.householdMode === 'create'
      ? this.auth.createHousehold(this.householdName, this.householdPassword, this.householdAddress)
      : this.auth.enterHousehold(this.householdId, this.householdPassword);
    request.subscribe({ next: () => window.location.reload(), error: (error) => (this.householdError = errMsg(error)) });
  }
  generateReport() {
    this.reportError = ''; this.reportLoading = true;
    this.api.get<any>('/reports/narrative').subscribe({
      next: (report) => {
        this.reportLoading = false; this.reportMarkdown = report.markdown;
        this.reportHtml = this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(report.markdown));
        this.showReportModal = true;
      },
      error: (e) => { this.reportError = errMsg(e); this.reportLoading = false; },
    });
  }
  downloadReportMarkdown() {
    const blob = new Blob([this.reportMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `household-report-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
