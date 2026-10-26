import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { Tema } from './core/tema';
import { ToastView } from './shared/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastView],
  template: '<router-outlet /><app-toast />',
})
export class App {
  private tema = inject(Tema);

  constructor() {
    const auth = inject(Auth);
    const router = inject(Router);
    // link de redefinição de senha cai na raiz: leva para a tela de nova senha
    effect(() => {
      if (auth.recuperando()) router.navigateByUrl('/nova-senha');
    });
  }
}
