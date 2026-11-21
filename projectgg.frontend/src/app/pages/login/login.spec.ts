import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let loginFailure: HttpErrorResponse;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login: () => throwError(() => loginFailure) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it.each([
    { status: 401, message: 'Invalid credentials', expected: 'Invalid email or password.' },
    { status: 401, message: 'Account locked. Try again in 2 minute(s).', expected: 'Account locked. Try again in 2 minute(s).' },
    { status: 0, message: undefined, expected: 'Could not reach the login service. Please try again.' },
  ])('shows the appropriate message for login failure $status $message', ({ status, message, expected }) => {
    loginFailure = new HttpErrorResponse({ status, error: { message } });
    component.email = 'player@example.com';
    component.password = 'test-password';

    component.submit();

    expect(component.error).toBe(expected);
    expect(component.loading).toBe(false);
  });
});
