import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

type TutorialStep = {
  id: string;
  selector: string;
  title: string;
  description: string;
  done: boolean;
};

@Component({
  selector: 'app-tutorial',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  templateUrl: './tutorial.component.html',
  styleUrls: ['./tutorial.component.scss'],
})
export class TutorialComponent implements AfterViewInit, OnDestroy {
  @Output() completed = new EventEmitter<void>();
  @ViewChild('tutorialCard', { read: ElementRef }) tutorialCard!: ElementRef<HTMLElement>;

  steps: TutorialStep[] = [
    {
      id: 'ggchat',
      selector: '.nav-ggchat-btn',
      title: 'Explore GG Chat',
      description: 'Click the GG Chat button to open the in-app chat and explore channels.',
      done: false,
    },
    {
      id: 'discord',
      selector: '.nav-discord-btn',
      title: 'Connect Discord',
      description: 'Click the Discord button to connect and view Discord integrations.',
      done: false,
    },
    {
      id: 'collection',
      selector: '.profile-trigger',
      title: 'Card Collection & Profile',
      description: 'Open your profile to view your card collection and customize your avatar.',
      done: false,
    },
    {
      id: 'music',
      selector: '.nav-music-btn',
      title: 'Music Player',
      description: 'Click the Music button to try the player and manage the queue.',
      done: false,
    },
  ];

  current = 0;
  private listeners: { el: Element; handler: EventListenerOrEventListenerObject }[] = [];
  private positionBound = this.positionCard.bind(this);

  get currentStep() {
    return this.steps[this.current];
  }

  get progressPercent(): number {
    return Math.round((this.steps.filter(s => s.done).length / this.steps.length) * 100);
  }

  ngAfterViewInit(): void {
    this.attachTargetListeners();
    requestAnimationFrame(() => this.positionCard());
    window.addEventListener('resize', this.positionBound);
    window.addEventListener('scroll', this.positionBound, true);
  }

  ngOnDestroy(): void {
    for (const l of this.listeners) {
      l.el.removeEventListener('click', l.handler as any);
    }
    window.removeEventListener('resize', this.positionBound);
    window.removeEventListener('scroll', this.positionBound, true);
  }

  attachTargetListeners(): void {
    this.steps.forEach((s, idx) => {
      const el = document.querySelector(s.selector);
      if (el) {
        const handler = (e: Event) => {
          this.onTargetClick(idx);
        };
        el.addEventListener('click', handler);
        this.listeners.push({ el, handler });
      }
    });
  }

  onTargetClick(index: number): void {
    if (!this.steps[index].done) {
      this.steps[index].done = true;
    }
    if (this.current === index && this.current < this.steps.length - 1) {
      this.current++;
      requestAnimationFrame(() => this.positionCard());
    }
  }

  next(): void {
    if (!this.steps[this.current].done) return;
    if (this.current < this.steps.length - 1) {
      this.current++;
      requestAnimationFrame(() => this.positionCard());
    }
  }

  prev(): void {
    if (this.current > 0) {
      this.current--;
      requestAnimationFrame(() => this.positionCard());
    }
  }

  goTo(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    this.current = index;
    requestAnimationFrame(() => this.positionCard());
  }

  finish(): void {
    if (!this.steps.every(s => s.done)) return;
    this.completed.emit();
  }

  positionCard(): void {
    const card = this.tutorialCard?.nativeElement;
    if (!card) return;
    const step = this.steps[this.current];
    const target = document.querySelector(step.selector) as HTMLElement | null;
    if (!target) {
      card.style.display = 'block';
      card.style.position = 'fixed';
      card.style.top = '80px';
      card.style.left = '50%';
      card.style.transform = 'translateX(-50%)';
      return;
    }

    const rect = target.getBoundingClientRect();
    card.style.display = 'block';
    card.style.position = 'absolute';
    card.style.transform = 'none';
    const top = rect.bottom + window.scrollY + 8;
    const cw = card.offsetWidth || 320;
    let left = rect.left + window.scrollX + (rect.width / 2) - (cw / 2);
    const pad = 8;
    if (left < pad) left = pad;
    if (left + cw > window.innerWidth - pad) left = window.innerWidth - cw - pad;
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }
}