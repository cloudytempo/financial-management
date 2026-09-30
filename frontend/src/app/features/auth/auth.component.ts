import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-auth', standalone: true, imports: [FormsModule, IconComponent],
  template: `
  <div class="authwrap"><div class="auth card">
    <div class="logo"><app-icon name="wallet" [size]="24" /></div>
    <h1>{{ mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back' }}</h1>
    <p class="sub">{{ mode === 'signin' ? 'Sign in to Home Ledger' : mode === 'reset' ? 'Enter your username (email) and a new password' : 'Start tracking your money' }}</p>
    <form (ngSubmit)="submit()">
      @if (mode === 'signup') { <label>Name<input name="name" [(ngModel)]="name" autocomplete="name" required></label> }
      <label>{{ mode === 'reset' ? 'Username (email)' : 'Email' }}<input name="email" type="email" [(ngModel)]="email" autocomplete="username" required></label>
      <label>{{ mode === 'reset' ? 'New password' : 'Password' }}<input name="password" type="password" [(ngModel)]="password" minlength="8" [attr.autocomplete]="mode === 'signin' ? 'current-password' : 'new-password'" required></label>
      @if (mode === 'reset') { <label>Confirm new password<input name="confirm" type="password" [(ngModel)]="confirm" minlength="8" autocomplete="new-password" required></label> }
      @if (error) { <div class="err">{{ error }}</div> }
      @if (info) { <div class="okmsg">{{ info }}</div> }
      <button class="btn" type="submit">{{ mode === 'signup' ? 'Sign up' : mode === 'reset' ? 'Reset password' : 'Sign in' }}</button>
    </form>
    <p class="muted small" style="margin-top:1rem;text-align:center">
      @if (mode === 'signin') { <a href="#" (click)="go($event, 'reset')">Forgot password?</a> · <a href="#" (click)="go($event, 'signup')">Create an account</a> }
      @else { <a href="#" (click)="go($event, 'signin')">Back to sign in</a> }
    </p>
  </div></div>`,
})
export class AuthComponent {
  private auth = inject(Auth); private router = inject(Router);
  mode: 'signin' | 'signup' | 'reset' = 'signin';
  name = ''; email = ''; password = ''; confirm = ''; error = ''; info = '';
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
    const obs = this.mode === 'signup' ? this.auth.signup(this.name, this.email, this.password) : this.auth.login(this.email, this.password);
    obs.subscribe({ next: () => this.router.navigate(['/dashboard']), error: fail });
  }
}
