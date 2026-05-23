import { Component, input, output, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CyberSelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-cyber-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cyber-select.component.html',
  styleUrls: ['./cyber-select.component.scss'],
})
export class CyberSelectComponent {
  readonly options = input.required<CyberSelectOption[]>();
  readonly value = input<string>('');
  readonly disabled = input(false);
  readonly placeholder = input('Select');
  readonly valueChange = output<string>();

  readonly open = signal(false);

  constructor(private readonly elementRef: ElementRef) {}

  get selectedLabel(): string {
    const v = this.value();
    if (!v) return '';
    return this.options().find(o => o.value === v)?.label ?? '';
  }

  toggle(): void {
    if (this.disabled()) return;
    this.open.update(v => !v);
  }

  select(opt: CyberSelectOption): void {
    this.valueChange.emit(opt.value);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
