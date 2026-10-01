import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth.service';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-admin-login', standalone: true, imports: [FormsModule],
  template: `
  <div class="authwrap admin-authwrap"><form class="auth card" (ngSubmit)="login()">
    <img class="logo homint-auth-logo" src="/favicon.svg" alt="Homint">
    <p class="admin-kicker">SYSTEM ADMINISTRATION</p><h1>Admin sign in</h1>
    <p class="sub">Separate access for Homint operations</p>
    <label>Email<input name="email" type="email" [(ngModel)]="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" [(ngModel)]="password" autocomplete="current-password" required></label>
    @if (error) { <div class="err">{{ error }}</div> }
    <button class="btn" type="submit" [disabled]="busy">{{ busy ? 'Signing in...' : 'Sign in' }}</button>
    <a class="muted small" href="/login" style="text-align:center">Back to Homint</a>
  </form></div>`,
})
export class AdminLoginComponent {
  private auth = inject(Auth); private router = inject(Router);
  email = 'admin@homint.com'; password = ''; error = ''; busy = false;
  login() {
    this.error = ''; this.busy = true;
    this.auth.adminLogin(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/admin/dashboard']),
      error: (e) => { this.error = errMsg(e); this.busy = false; },
    });
  }
}
