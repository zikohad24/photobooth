import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';

@Component({
  selector: 'app-camera',
  imports: [],
  templateUrl: './camera.html',
  styleUrl: './camera.css',
})
export class Camera implements AfterViewInit, OnDestroy {
  @ViewChild('video') video!: ElementRef<HTMLVideoElement>;

  stream?: MediaStream;
  error = signal('');
  cameraReady = signal(false);
  busy = signal(false);
  count = signal(0);
  screen = signal<'camera' | 'review'>('camera');
  photos = signal<string[]>([]);
  currentShot = signal(0);
  lastPhoto = signal<string | null>(null);

  async ngAfterViewInit() {
    await this.startCamera();
  }

  async startCamera() {
    this.error.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
        audio: false,
      });
      this.video.nativeElement.srcObject = this.stream;
      this.cameraReady.set(true);
    } catch {
      this.error.set('No se pudo abrir la cámara. Permite el acceso en el navegador.');
    }
  }

  // Sesión completa: 3 fotos seguidas
  async startSession() {
    if (this.busy() || !this.cameraReady()) return;
    this.busy.set(true);
    this.photos.set([]);

    for (let i = 1; i <= 3; i++) {
      this.currentShot.set(i);
      const photo = await this.countdownAndShoot();
      this.photos.update((list) => [...list, photo]);
      this.lastPhoto.set(photo);
      await this.sleep(1000);
      this.lastPhoto.set(null);
    }

    this.currentShot.set(0);
    this.busy.set(false);
    this.screen.set('review');
  }

  // Repetir solo una foto (index: 0, 1 o 2)
  async retake(index: number) {
    if (this.busy()) return;
    this.busy.set(true);
    this.screen.set('camera');
    await this.sleep(400);

    const photo = await this.countdownAndShoot();
    this.photos.update((list) => list.map((p, i) => (i === index ? photo : p)));

    this.busy.set(false);
    this.screen.set('review');
  }

  restart() {
    this.photos.set([]);
    this.screen.set('camera');
  }

  private async countdownAndShoot(): Promise<string> {
    for (let i = 3; i > 0; i--) {
      this.count.set(i);
      await this.sleep(1000);
    }
    this.count.set(0);
    return this.capture();
  }

  private capture(): string {
    const video = this.video.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}