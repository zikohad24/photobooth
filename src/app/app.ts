import { Component } from '@angular/core';
import { Camera } from './camera/camera';

@Component({
  selector: 'app-root',
  imports: [Camera],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // (deja aquí lo que ya tengas dentro de la clase)
}