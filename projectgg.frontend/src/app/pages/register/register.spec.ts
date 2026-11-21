import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject, TimeoutError } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from '../../services/auth.service';
import { UsersService } from '../../services/users.service';
import { Register } from './register';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;
  let response: Subject<object>;
  let verification: Subject<{ message: string }>;
  let verifyEmail: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    response = new Subject<object>();
    verification = new Subject<{ message: string }>();
    verifyEmail = vi.fn(() => verification);
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { register: () => response } },
        { provide: UsersService, useValue: { verifyEmail } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    component.name = 'Player';
    component.username = 'player';
    component.email = 'player@example.com';
    component.dateOfBirth = '2000-01-01';
    component.password = component.confirmPassword = 'test-password';
    await fixture.whenStable();
    fixture.nativeElement.querySelector('dialog').showModal = vi.fn();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens verification after registration and lets the user skip to the dashboard', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.submit();
    expect(component.loading).toBe(true);

    response.next({ success: true });

    expect(component.loading).toBe(false);
    expect(fixture.nativeElement.querySelector('dialog').showModal).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    component.continueToDashboard();
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('keeps the dialog available after a rejected code and continues after verification', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.submit();
    response.next({ success: true });
    component.verificationCode = 'abc123';

    component.verifyEmail();
    expect(verifyEmail).toHaveBeenCalledWith('ABC123');
    verification.error({ error: { message: 'Invalid code' } });
    expect(component.verificationError).toBe('Invalid code');
    expect(navigate).not.toHaveBeenCalled();

    verification = new Subject<{ message: string }>();
    component.verifyEmail();
    verification.next({ message: 'Verified' });
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('stops spinning and suggests signing in after a timeout', () => {
    component.submit();
    response.error(new TimeoutError());

    expect(component.loading).toBe(false);
    expect(component.error).toContain('Try signing in');
  });
});
