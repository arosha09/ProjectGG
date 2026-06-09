import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  Renderer2,
  SimpleChanges,
  inject,
} from '@angular/core';
import { WebpImageService } from '../../services/webp-image.service';

@Directive({
  selector: 'img[appWebpSrc]',
  standalone: true,
})
export class WebpSrcDirective implements OnChanges, OnDestroy {
  @Input('appWebpSrc') src: string | undefined = undefined;
  @Input() appWebpPriority: 'auto' | 'high' | 'low' = 'auto';

  private el = inject(ElementRef<HTMLImageElement>);
  private renderer = inject(Renderer2);
  private webpService = inject(WebpImageService);
  private lastSwappedUrl: string | null = null;
  private destroyed = false;
  private currentToken = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['src']) return;
    const url = this.src;
    if (!url) {
      this.renderer.setAttribute(this.el.nativeElement, 'src', '');
      return;
    }
    this.renderer.setAttribute(this.el.nativeElement, 'src', url);
    this.renderer.setAttribute(
      this.el.nativeElement,
      'fetchpriority',
      this.appWebpPriority,
    );
    this.swapToWebp(url);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  private swapToWebp(url: string): void {
    const token = ++this.currentToken;
    this.webpService.getWebpUrl(url).then((webpUrl) => {
      if (this.destroyed) return;
      if (token !== this.currentToken) return;
      if (this.src !== url) return;
      if (webpUrl === url) return;
      if (this.lastSwappedUrl === webpUrl) return;
      this.lastSwappedUrl = webpUrl;
      this.renderer.setAttribute(this.el.nativeElement, 'src', webpUrl);
    });
  }
}
