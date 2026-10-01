import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { errMsg } from '../../shared/util';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-auth', standalone: true, imports: [FormsModule, IconComponent, TranslatePipe],
  template: `
  <div class="authwrap"><div class="auth card">
    <img class="logo homint-auth-logo" src="/favicon.svg" alt="Homint">
    <h1>{{ (mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : mode === 'reactivate' ? 'Reactivate account' : 'Welcome back') | tr }}</h1>
    <p class="sub">{{ (mode === 'signin' ? 'Sign in to Homint' : mode === 'reset' ? 'Enter your username (email) and a new password' : mode === 'reactivate' ? 'Set a new password to restore account access' : 'Start tracking your money') | tr }}</p>
    <form (ngSubmit)="submit()">
      @if (mode === 'signup') { <label>{{ 'Name' | tr }}<input name="name" [(ngModel)]="name" autocomplete="name" required></label> }
      @if (mode !== 'reactivate') { <label>{{ (mode === 'reset' ? 'Username (email)' : 'Email') | tr }}<input name="email" type="email" [(ngModel)]="email" autocomplete="username" required></label> }
      <label>{{ (mode === 'reset' || mode === 'reactivate' ? 'New password' : 'Password') | tr }}<input name="password" type="password" [(ngModel)]="password" minlength="8" [attr.autocomplete]="mode === 'signin' ? 'current-password' : 'new-password'" required></label>
      @if (mode === 'signup') {
        <div class="seg" style="margin-bottom:1rem">
          <button type="button" [class.on]="householdMode === 'create'" (click)="householdMode = 'create'">{{ 'Create household' | tr }}</button>
          <button type="button" [class.on]="householdMode === 'join'" (click)="householdMode = 'join'">{{ 'Join household' | tr }}</button>
        </div>
        <label>{{ 'Household name' | tr }}<input name="householdName" [(ngModel)]="householdName" autocomplete="organization" required></label>
        <label>{{ 'Household password' | tr }}<input name="householdPassword" type="password" [(ngModel)]="householdPassword" minlength="8" autocomplete="new-password" required></label>
      }
      @if (mode === 'reset' || mode === 'reactivate') { <label>{{ 'Confirm new password' | tr }}<input name="confirm" type="password" [(ngModel)]="confirm" minlength="8" autocomplete="new-password" required></label> }
      @if (error) { <div class="err">{{ error | tr }}</div> }
      @if (info) { <div class="okmsg">{{ info | tr }}</div> }
      <button class="btn" type="submit">{{ (mode === 'signup' ? 'Sign up' : mode === 'reset' ? 'Reset password' : mode === 'reactivate' ? 'Set new password' : 'Sign in') | tr }}</button>
    </form>
    <p class="muted small" style="margin-top:1rem;text-align:center">
      @if (mode === 'signin') { <a href="#" (click)="go($event, 'reset')">{{ 'Forgot password?' | tr }}</a> · <a href="#" (click)="go($event, 'signup')">{{ 'Create an account' | tr }}</a><br><a href="/admin/login">{{ 'System admin' | tr }}</a> }
      @else if (mode !== 'reactivate') { <a href="#" (click)="go($event, 'signin')">{{ 'Back to sign in' | tr }}</a> }
    </p>
  </div><footer class="brand-footer login-brand-footer">{{ 'Powered by CloudyTempo · © 2026 All rights reserved.' | tr }}</footer></div>`,
})
export class AuthComponent {
  private auth = inject(Auth); private router = inject(Router);
  mode: 'signin' | 'signup' | 'reset' | 'reactivate' = 'signin';
  name = ''; email = ''; password = ''; confirm = ''; error = ''; info = '';
  reactivationToken = '';
  householdMode: 'create' | 'join' = 'create'; householdName = ''; householdPassword = '';
  go(e: Event, m: 'signin' | 'signup' | 'reset') { e.preventDefault(); this.mode = m; this.error = ''; this.info = ''; this.password = ''; this.confirm = ''; }
  submit() {
    this.error = ''; this.info = '';
    const fail = (e: any) => (this.error = errMsg(e));
    if (this.mode === 'reset') {
      if (this.password !== this.confirm) { this.error = 'The two passwords do not match.'; return; }
      this.auth.resetPassword(this.email, this.password).subscribe({
        next: () => { this.mode = 'signin'; this.password = ''; this.confirm = ''; this.info = 'Password updated. Sign in with your new password.'; }, error: fail });
      return;
    }
    if (this.mode === 'reactivate') {
      if (this.password !== this.confirm) { this.error = 'The two passwords do not match.'; return; }
      this.auth.reactivate(this.reactivationToken, this.password).subscribe({
        next: (r) => this.router.navigate([r.user.household ? '/dashboard' : '/settings']), error: fail,
      });
      return;
    }
    const obs = this.mode === 'signup'
      ? this.auth.signup(this.name, this.email, this.password, this.householdMode, this.householdName, this.householdPassword)
      : this.auth.login(this.email, this.password);
    obs.subscribe({ next: (r) => {
      if (r.reactivationRequired) { this.reactivationToken = r.token; this.mode = 'reactivate'; this.password = ''; return; }
      this.router.navigate([r.user.household ? '/dashboard' : '/settings']);
    }, error: fail });
  }
}
