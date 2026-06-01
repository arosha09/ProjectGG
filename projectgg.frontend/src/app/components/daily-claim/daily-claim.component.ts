import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-daily-claim',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './daily-claim.component.html',
  styleUrls: ['./daily-claim.component.scss'],
})
export class DailyClaimComponent {
  readonly canClaim = input(false);
  readonly loading = input(false);
  readonly claim = output<void>();

  get label(): string {
    if (this.loading()) return 'Claiming...';
    if (!this.canClaim()) return 'Claimed';
    return 'Claim Daily XP';
  }
}
