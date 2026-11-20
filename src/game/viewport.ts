/**
 * Manages automatic landscape mode across Android Chrome (Fullscreen + Screen Orientation Lock)
 * and iOS Safari (pixel-exact virtual 90deg CSS landscape fallback when held in portrait).
 */
export class LandscapeViewport {
  private appEl: HTMLElement;
  private wantLandscape = false;
  public isForceRotated = false;

  constructor(appEl: HTMLElement) {
    this.appEl = appEl;
    this.sync();
  }

  public async enterLandscape(): Promise<void> {
    this.wantLandscape = true;

    // 1. Try native Fullscreen + Screen Orientation API (works on Android Chrome / Edge / PWA)
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
      }
    } catch {
      // Ignore fullscreen denial (e.g. iOS Safari)
    }

    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape');
      }
    } catch {
      // iOS Safari or desktop browsers don't allow orientation.lock; CSS fallback handles it
    }

    this.sync();
  }

  public async exitLandscape(): Promise<void> {
    this.wantLandscape = false;

    try {
      const orientation = screen.orientation as ScreenOrientation & {
        unlock?: () => void;
      };
      if (orientation && typeof orientation.unlock === 'function') {
        orientation.unlock();
      }
    } catch {
      // Ignore
    }

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore
    }

    this.sync();
  }

  /**
   * Re-evaluates whether virtual CSS rotation is needed (when in-game and screen is portrait).
   * Returns true if layout dimensions or rotation state changed.
   */
  public sync(): void {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const isPortrait = wh > ww;

    this.isForceRotated = this.wantLandscape && isPortrait;
    this.appEl.style.setProperty('--vw', `${ww}px`);
    this.appEl.style.setProperty('--vh', `${wh}px`);
    this.appEl.classList.toggle('force-landscape', this.isForceRotated);
  }

  public getSize(): { width: number; height: number } {
    if (this.isForceRotated) {
      return { width: window.innerHeight, height: window.innerWidth };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }

  /**
   * Maps browser clientX/clientY into virtual app coordinates (accounting for 90deg clockwise rotation).
   * Transform is: translate(vw, 0) rotate(90deg) around top-left => vx = vw - ly, vy = lx
   * Inverse: lx = clientY, ly = vw - clientX
   */
  public clientToVirtual(clientX: number, clientY: number): { x: number; y: number } {
    if (this.isForceRotated) {
      return {
        x: clientY,
        y: window.innerWidth - clientX,
      };
    }
    return { x: clientX, y: clientY };
  }
}
