import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import * as QRCode from 'qrcode';

interface PhotoFilter {
  id: string;
  name: string;
  css: string;
}

interface EventTheme {
  id: string;
  name: string;
  emojis: string[];
  tint: string;
}

interface Sticker {
  id: number;
  emoji: string;
  x: number; // posición en % del ancho de la cámara
  y: number; // posición en % del alto
  size: number; // tamaño en % del ancho
}

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

@Component({
  selector: 'app-camera',
  imports: [],
  templateUrl: './camera.html',
  styleUrl: './camera.css',
})
export class Camera implements AfterViewInit, OnDestroy {
  @ViewChild('video') video!: ElementRef<HTMLVideoElement>;
  @ViewChild('stage') stageEl!: ElementRef<HTMLElement>;

  readonly TOTAL = 4;
  readonly API = 'http://localhost:3000';
  slots = [0, 1, 2, 3];

  filters: PhotoFilter[] = [
    { id: 'bw', name: 'Blanco y negro', css: 'grayscale(1) contrast(1.1)' },
    { id: 'sepia', name: 'Sepia', css: 'sepia(0.85) contrast(1.05)' },
    { id: 'color', name: 'Color', css: 'none' },
  ];

  backdrops = [
    { id: 'stripes', name: 'Rayas' },
    { id: 'dots', name: 'Lunares' },
    { id: 'check', name: 'Cuadros' },
    { id: 'stars', name: 'Estrellas' },
    { id: 'hearts', name: 'Corazones' },
    { id: 'plain', name: 'Liso' },
  ];

  events: EventTheme[] = [
    { id: 'party', name: 'Cumpleaños', emojis: ['🎈', '🎂', '🎉'], tint: '#ffe3ef' },
    { id: 'wedding', name: 'Boda', emojis: ['💐', '💍', '🥂'], tint: '#f3ecff' },
    { id: 'grad', name: 'Graduación', emojis: ['🎓', '📜', '⭐'], tint: '#e3f0ff' },
    { id: 'xmas', name: 'Navidad', emojis: ['🎄', '🎁', '⭐'], tint: '#e3f7e8' },
    { id: 'love', name: 'San Valentín', emojis: ['❤️', '💘', '✨'], tint: '#ffdfe5' },
    { id: 'none', name: 'Sin dibujos', emojis: [], tint: '#f1ede2' },
  ];

  stickerList = ['🕶️', '👓', '🎩', '👒', '👑', '🎅', '🥳', '🎀', '🐱', '❤️', '⭐', '🌈'];

  stream?: MediaStream;
  error = signal('');
  cameraReady = signal(false);
  busy = signal(false);
  count = signal(0);
  screen = signal<'camera' | 'review' | 'strip'>('camera');
  photos = signal<string[]>([]);
  currentShot = signal(0);
  lastPhoto = signal<string | null>(null);
  stripUrl = signal<string | null>(null);

  filter = signal<string>('bw');
  backdrop = signal<string>('stripes');
  paper = signal<'white' | 'black'>('white');
  showDate = signal(true);
  title = signal('PHOTOBOOTH');
  event = signal<string>('party');

  placed = signal<Sticker[]>([]);
  selected = signal<number | null>(null);
  private dragId: number | null = null;

  qrUrl = signal<string | null>(null);
  qrBusy = signal(false);

  today = new Date().toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  private imgs: HTMLImageElement[] = [];

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

  filterCss(): string {
    return this.filters.find((f) => f.id === this.filter())?.css ?? 'none';
  }

  eventData(): EventTheme {
    return this.events.find((e) => e.id === this.event()) ?? this.events[0];
  }

  // ---------- Emojis sobre la cámara ----------
  addSticker(emoji: string) {
    const s: Sticker = { id: Date.now() + Math.random(), emoji, x: 50, y: 38, size: 22 };
    this.placed.update((list) => [...list, s]);
    this.selected.set(s.id);
  }

  clearStickers() {
    this.placed.set([]);
    this.selected.set(null);
  }

  selectedSize(): number {
    return this.placed().find((s) => s.id === this.selected())?.size ?? 22;
  }

  setSize(value: number) {
    this.placed.update((list) =>
      list.map((s) => (s.id === this.selected() ? { ...s, size: value } : s)),
    );
  }

  startDrag(ev: PointerEvent, s: Sticker) {
    this.selected.set(s.id);
    this.dragId = s.id;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }

  drag(ev: PointerEvent) {
    if (this.dragId === null) return;
    const el = this.stageEl.nativeElement;
    const r = el.getBoundingClientRect();
    const x = ((ev.clientX - r.left - el.clientLeft) / el.clientWidth) * 100;
    const y = ((ev.clientY - r.top - el.clientTop) / el.clientHeight) * 100;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    this.placed.update((list) =>
      list.map((s) => (s.id === this.dragId ? { ...s, x: clamp(x), y: clamp(y) } : s)),
    );
  }

  endDrag() {
    this.dragId = null;
  }

  // ---------- Sesión de fotos ----------
  async startSession() {
    if (this.busy() || !this.cameraReady()) return;
    this.busy.set(true);
    this.photos.set([]);

    for (let i = 1; i <= this.TOTAL; i++) {
      this.currentShot.set(i);
      const photo = await this.countdownAndShoot();
      this.photos.update((list) => [...list, photo]);
      this.lastPhoto.set(photo);
      await this.sleep(1400);
      this.lastPhoto.set(null);
    }

    this.currentShot.set(0);
    this.busy.set(false);
    this.screen.set('review');
  }

  async retake(index: number) {
    if (this.busy()) return;
    this.busy.set(true);
    this.screen.set('camera');
    this.currentShot.set(index + 1);
    await this.sleep(400);

    const photo = await this.countdownAndShoot();
    this.photos.update((list) => list.map((p, i) => (i === index ? photo : p)));

    this.currentShot.set(0);
    this.busy.set(false);
    this.screen.set('review');
  }

  restart() {
    this.photos.set([]);
    this.screen.set('camera');
  }

  // ---------- Pantalla final: la tira se actualiza en vivo ----------
  async createStrip() {
    this.imgs = await Promise.all(this.photos().map((src) => this.loadImage(src)));
    this.renderStrip();
    this.screen.set('strip');
  }

  setBackdrop(id: string) {
    this.backdrop.set(id);
  }

  setEvent(id: string) {
    this.event.set(id);
    this.renderStrip();
  }

  setPaper(p: 'white' | 'black') {
    this.paper.set(p);
    this.renderStrip();
  }

  setTitle(value: string) {
    this.title.set(value);
    this.renderStrip();
  }

  setShowDate(value: boolean) {
    this.showDate.set(value);
    this.renderStrip();
  }

  private renderStrip() {
    if (!this.imgs.length) return;
    this.qrUrl.set(null); // si la tira cambia, el QR anterior ya no vale

    const ev = this.eventData();
    const dark = this.paper() === 'black';
    const bg = dark ? '#141114' : '#ffffff';
    const line = dark ? '#f7f2e8' : '#1c1416';
    const ink = '#1c1416'; // el texto va dentro del cuadro claro

    const W = 420;
    const pad = 24;
    const gap = 12;
    const photoW = W - pad * 2;
    const photoH = (photoW * 3) / 4;
    const hasEmojis = ev.emojis.length > 0;
    const boxH = hasEmojis ? 176 : 112;
    const photosH = photoH * this.imgs.length + gap * (this.imgs.length - 1);
    const boxY = pad + photosH + gap;
    const H = boxY + boxH + pad;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Las fotos
    this.imgs.forEach((img, i) => {
      const y = pad + i * (photoH + gap);
      const ratio = 4 / 3;
      let sw = img.width;
      let sh = img.width / ratio;
      if (sh > img.height) {
        sh = img.height;
        sw = img.height * ratio;
      }
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, pad, y, photoW, photoH);
    });

    // Segundo cuadro: dibujos del evento + texto + fecha
    ctx.fillStyle = ev.tint;
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(pad, boxY, photoW, boxH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = ink;

    if (hasEmojis) {
      ctx.font = `40px ${EMOJI_FONT}`;
      const n = ev.emojis.length;
      ev.emojis.forEach((e, i) => {
        ctx.fillText(e, W / 2 + (i - (n - 1) / 2) * 76, boxY + 62);
      });
    }

    const text = this.title().trim().toUpperCase();
    const show = this.showDate();
    const titleY = (hasEmojis ? boxY + 116 : boxY + 54) + (show ? 0 : 12);
    const dateY = hasEmojis ? boxY + 148 : boxY + 86;

    if (text) {
      let size = 28;
      ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
      while (ctx.measureText(text).width > photoW - 24 && size > 14) {
        size -= 2;
        ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
      }
      ctx.fillText(text, W / 2, titleY);
    }

    if (show) {
      ctx.font = '18px "Trebuchet MS", sans-serif';
      ctx.fillText(this.today, W / 2, dateY);
    }

    this.stripUrl.set(canvas.toDataURL('image/png'));
  }

  downloadStrip() {
    const a = document.createElement('a');
    a.href = this.stripUrl()!;
    a.download = `tira-${Date.now()}.png`;
    a.click();
  }

  // ---------- QR: sube la tira al servidor y crea el código ----------
  async generateQr() {
    const strip = this.stripUrl();
    if (!strip || this.qrBusy()) return;
    this.qrBusy.set(true);
    this.error.set('');
    try {
      const res = await fetch(`${this.API}/api/strips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: strip }),
      });
      if (!res.ok) throw new Error('upload');
      const { url } = await res.json();
      this.qrUrl.set(await QRCode.toDataURL(url, { width: 260, margin: 1 }));
    } catch {
      this.error.set('No se pudo crear el QR. ¿Está encendido el servidor? (node server/index.cjs)');
    } finally {
      this.qrBusy.set(false);
    }
  }

  backToReview() {
    this.screen.set('review');
  }

  newSession() {
    this.photos.set([]);
    this.stripUrl.set(null);
    this.qrUrl.set(null);
    this.imgs = [];
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
    const w = 960;
    const h = 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Recorte 4:3 centrado, en modo espejo y con el filtro elegido
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const ratio = w / h;
    let sw = vw;
    let sh = vw / ratio;
    if (sh > vh) {
      sh = vh;
      sw = vh * ratio;
    }
    ctx.save();
    ctx.filter = this.filterCss();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
    ctx.restore();

    // Emojis encima (sin filtro, para que conserven su color)
    ctx.filter = 'none';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.placed()) {
      ctx.font = `${(s.size / 100) * w}px ${EMOJI_FONT}`;
      ctx.fillText(s.emoji, (s.x / 100) * w, (s.y / 100) * h);
    }

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}