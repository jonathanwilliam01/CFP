import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Tema } from './core/tema';
import { ToastView } from './shared/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastView],
  template: '<router-outlet /><app-toast />',
})
export class App {
  private tema = inject(Tema);
}
