import { Component, input, output, signal, effect, computed, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

type CalView = 'days' | 'months' | 'years';

@Component({
  selector: 'app-cyber-date-picker',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './cyber-date-picker.component.html',
  styleUrls: ['./cyber-date-picker.component.scss'],
})
export class CyberDatePickerComponent {
  readonly value = input<string>('');
  readonly disabled = input(false);
  readonly placeholder = input('Select date');
  readonly iconColor = input<string>('');
  readonly valueChange = output<string>();

  readonly open = signal(false);
  readonly calView = signal<CalView>('days');
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());
  readonly selDate = signal<Date | null>(null);

  readonly months = MONTHS;
  readonly dayLabels = DAYS;

  readonly viewDecadeStart = computed(() => {
    const y = this.viewYear();
    return y - (y % 12);
  });

  readonly yearGrid = computed(() => {
    const start = this.viewDecadeStart();
    const grid: number[] = [];
    for (let i = 0; i < 12; i++) grid.push(start + i);
    return grid;
  });

  constructor(private readonly elementRef: ElementRef) {
    effect(() => {
      const v = this.value();
      if (v) {
        const d = new Date(v + 'T00:00:00');
        if (!isNaN(d.getTime())) {
          this.selDate.set(d);
          this.viewYear.set(d.getFullYear());
          this.viewMonth.set(d.getMonth());
          return;
        }
      }
      this.selDate.set(null);
    });
  }

  get displayText(): string {
    const d = this.selDate();
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  get daysGrid(): (number | null)[] {
    const year = this.viewYear();
    const month = this.viewMonth();
    const first = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (number | null)[] = [];
    for (let i = 0; i < first; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    return grid;
  }

  isToday(day: number): boolean {
    const d = this.selDate();
    if (!d) return false;
    return d.getDate() === day && d.getMonth() === this.viewMonth() && d.getFullYear() === this.viewYear();
  }

  showMonthGrid(): void {
    this.calView.set('months');
  }

  showYearGrid(): void {
    this.calView.set('years');
  }

  showDaysGrid(): void {
    this.calView.set('days');
  }

  selectMonth(monthIndex: number): void {
    this.viewMonth.set(monthIndex);
    this.calView.set('days');
  }

  selectYear(year: number): void {
    this.viewYear.set(year);
    this.calView.set('days');
  }

  prevDecade(): void {
    this.viewYear.set(this.viewDecadeStart() - 1);
  }

  nextDecade(): void {
    this.viewYear.set(this.viewDecadeStart() + 12);
  }

  prevMonth(): void {
    if (this.viewMonth() === 0) {
      this.viewYear.set(this.viewYear() - 1);
      this.viewMonth.set(11);
    } else {
      this.viewMonth.set(this.viewMonth() - 1);
    }
  }

  nextMonth(): void {
    if (this.viewMonth() === 11) {
      this.viewYear.set(this.viewYear() + 1);
      this.viewMonth.set(0);
    } else {
      this.viewMonth.set(this.viewMonth() + 1);
    }
  }

  selectDay(day: number): void {
    const d = new Date(this.viewYear(), this.viewMonth(), day);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    this.valueChange.emit(`${yyyy}-${mm}-${dd}`);
    this.open.set(false);
  }

  toggle(): void {
    if (this.disabled()) return;
    if (!this.open()) {
      this.open.set(true);
      this.calView.set('days');
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.open.set(false);
      this.calView.set('days');
    }
  }
}
