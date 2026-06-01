import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-collection-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './collection-button.component.html',
  styleUrls: ['./collection-button.component.scss'],
})
export class CollectionButtonComponent {
  readonly mode = input<'add' | 'remove'>('add');
  readonly disabled = input(false);
  readonly label = input<string | null>(null);
  readonly action = output<void>();

  onClick(): void {
    if (this.disabled()) return;
    this.action.emit();
  }
}
