import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class StatusNotificationService {
  constructor(private snackBar: MatSnackBar) {}

  triggerThemeAlert(message: string) {
    this.snackBar.open(message, 'CLOSE', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['cyber-red-toast']
    });
  }
}
