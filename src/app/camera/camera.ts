import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';

@Component({
  selector: 'app-camera',
  imports: [],
  templateUrl: './camera.html',
  styleUrl: './camera.css',
})
export class Camera implements OnDestroy {
  @ViewChild('video') video!: ElementRef<HTMLVideoElement>;
  stream?: MediaStream;
  error = '';

  async startCamera() {
    this.error = '';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
        audio: false,
      });
      this.video.nativeElement.srcObject = this.stream;
    } catch {
      this.error = 'No se pudo abrir la cámara. Permite el acceso en el navegador.';
    }
  }

  ngOnDestroy() {
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}