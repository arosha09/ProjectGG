import { Component, input, output, signal, HostListener, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface CyberSelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-cyber-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  templateUrl: './cyber-select.component.html',
  styleUrls: ['./cyber-select.component.scss'],
})
export class CyberSelectComponent {
  readonly options = input.required<CyberSelectOption[]>();
  readonly value = input<string>('');
  readonly disabled = input(false);
  readonly placeholder = input('Select');
  readonly openAbove = input(false);
  readonly icon = input<string | null>(null);
  readonly label = input<string | null>(null);
  readonly valueChange = output<string>();
  readonly openChange = output<boolean>();

  readonly open = signal(false);

  constructor(private readonly elementRef: ElementRef) {}

  get selectedLabel(): string {
    const v = this.value();
    if (!v) return '';
    return this.options().find(o => o.value === v)?.label ?? '';
  }

  toggle(): void {
    if (this.disabled()) return;
    const next = !this.open();
    this.open.set(next);
    this.openChange.emit(next);
  }

  select(opt: CyberSelectOption): void {
    this.valueChange.emit(opt.value);
    this.open.set(false);
    this.openChange.emit(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      if (this.open()) {
        this.open.set(false);
        this.openChange.emit(false);
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open()) {
      this.open.set(false);
      this.openChange.emit(false);
    }
  }
}
