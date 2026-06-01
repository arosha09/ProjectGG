import { Component, input, output, signal, HostListener, ElementRef, contentChild, TemplateRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './dropdown.component.html',
  styleUrls: ['./dropdown.component.scss'],
})
export class DropdownComponent {
  readonly options = input.required<DropdownOption[]>();
  readonly value = input<string>('');
  readonly label = input<string>('');
  readonly disabled = input(false);
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

  select(opt: DropdownOption): void {
    this.valueChange.emit(opt.value);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
