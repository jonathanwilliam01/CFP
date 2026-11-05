import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Admin } from '../core/admin';
import { FUNCOES, Funcoes } from '../core/funcoes';
import { FuncaoStatus } from '../core/models';
import { Icon } from '../shared/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  template: `
    <div class="wrap">
      <app-icon name="construction" [size]="48" />
      <h1>{{ funcao()?.nome }} em manutenção</h1>
      <p class="muted">{{ status()?.mensagem || 'Volta em breve.' }}</p>
      <a class="btn" routerLink="/">Voltar</a>
    </div>
  `,
  styles: `
    .wrap { min-height: 60dvh; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; padding: 24px 16px; text-align: center; color: var(--text); }
    h1 { margin: 0; font-size: 1.25rem; }
    p { margin: 0; max-width: 32rem; }
  `,
})
export default class Manutencao {
  private fs = inject(Funcoes);
  private admin = inject(Admin);
  private router = inject(Router);
  private chave = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('chave') ?? '')), { initialValue: '' });
  protected funcao = computed(() => FUNCOES.find((x) => x.chave === this.chave()));
  protected status = computed((): FuncaoStatus | undefined => this.fs.status()[this.chave()]);

  constructor() {
    effect(() => {
      const fn = this.funcao();
      const livre = this.status()?.ativa !== false || this.admin.eAdmin() === true;
      untracked(() => this.router.navigateByUrl(fn && livre ? fn.rotas[0] : '/', { replaceUrl: true }).catch(() => {}));
    });
  }
}
