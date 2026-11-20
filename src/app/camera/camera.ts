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
  photo = signal<string | null>(null);

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

  async start() {
    if (this.busy() || !this.cameraReady()) return;
    this.busy.set(true);
    this.photo.set(null);

    for (let i = 3; i > 0; i--) {
      this.count.set(i);
      await this.sleep(1000);
    }
    this.count.set(0);

    this.takePhoto();
    this.busy.set(false);
  }

  takePhoto() {
    const video = this.video.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    // Espejo: la foto sale igual que la ves en pantalla
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    this.photo.set(canvas.toDataURL('image/jpeg', 0.92));
  }

  retake() {
    this.photo.set(null);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}