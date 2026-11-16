import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

/** Verificação em duas etapas, termos/privacidade e exclusão da conta */
@Component({
  imports: [FormsModule, RouterLink, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Segurança e privacidade</h1></div>

      <section class="card">
        <div class="card-head"><h2>Verificação em duas etapas</h2>
          @if (ativa() !== null) { <span class="badge" [class.ok]="ativa()">{{ ativa() ? 'Ativa' : 'Desligada' }}</span> }
        </div>
        <p class="small muted">Além da senha, o login pede um código do app autenticador do celular. Quem descobrir sua senha não entra sem ele.</p>
        @if (ativa()) {
          <button class="btn ghost block" type="button" [disabled]="ocupado()" (click)="desativar()">Desligar</button>
        } @else if (ativa() === false) {
          <button class="btn block" type="button" [disabled]="ocupado()" (click)="iniciar()"><app-icon name="shield_lock" [size]="18" />Ativar</button>
        }
      </section>

      <section class="card list">
        <a class="row" routerLink="/termos"><span class="ico"><app-icon name="gavel" /></span><div class="grow"><div class="t">Termos de uso</div></div><app-icon name="chevron_right" /></a>
        <a class="row" routerLink="/privacidade"><span class="ico"><app-icon name="privacy_tip" /></span><div class="grow"><div class="t">Política de privacidade</div></div><app-icon name="chevron_right" /></a>
        <a class="row" routerLink="/config"><span class="ico"><app-icon name="download" /></span><div class="grow"><div class="t">Baixar meus dados</div><div class="s">Configurações → Baixar backup</div></div><app-icon name="chevron_right" /></a>
      </section>

      <section class="card perigo">
        <div class="card-head"><h2>Excluir conta</h2></div>
        <p class="small muted">Apaga seu login, sua foto e as carteiras em que você é o único membro, com os comprovantes. Em carteira compartilhada, os lançamentos ficam para os outros membros, sem seu nome. Não dá para desfazer.</p>
        <button class="btn danger block" type="button" (click)="excluindo.set(true)"><app-icon name="delete_forever" [size]="18" />Excluir minha conta</button>
      </section>
    </div>

    <app-sheet [(open)]="ativando" titulo="Ativar duas etapas">
      @if (novo(); as n) {
        <form class="form" (ngSubmit)="confirmar(n.id)">
          <p class="small">1. No app autenticador, adicione uma conta lendo o QR code:</p>
          <img class="qr" [src]="n.qr" alt="QR code da verificação em duas etapas" width="200" height="200" />
          <p class="small muted">No mesmo celular? Digite a chave: <code class="chave">{{ n.chave }}</code>
            <button type="button" class="btn ghost sm" (click)="copiar(n.chave)">Copiar</button></p>
          <label class="field"><span>2. Código de 6 dígitos que apareceu</span>
            <input name="codigo" [(ngModel)]="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required />
          </label>
          <button class="btn block" [disabled]="ocupado()">Confirmar e ativar</button>
        </form>
      }
    </app-sheet>

    <app-sheet [(open)]="excluindo" titulo="Excluir conta">
      <form class="form" (ngSubmit)="excluir()">
        <p class="small">Isso é definitivo. Se quiser guardar seus dados, baixe o backup antes.</p>
        @if (sozinho()) {
          <p class="small neg">A carteira "{{ s.carteira()?.nome }}" só tem você e será apagada com tudo dentro.</p>
        }
        <label class="field"><span>Digite EXCLUIR para confirmar</span><input name="conf" [(ngModel)]="confirmacao" autocomplete="off" /></label>
        <button class="btn danger block" [disabled]="ocupado() || confirmacao.trim().toUpperCase() !== 'EXCLUIR'">Excluir para sempre</button>
      </form>
    </app-sheet>
  `,
  styles: `
    .card { display: flex; flex-direction: column; gap: 10px; }
    .card.list { gap: 0; }
    .row { color: inherit; text-decoration: none; }
    .perigo h2 { color: var(--danger); }
    .qr { align-self: center; background: #fff; border-radius: 12px; padding: 8px; }
    .chave { word-break: break-all; font-size: 0.85rem; }
  `,
})
export default class Seguranca {
  private auth = inject(Auth);
  protected s = inject(Store);
  private router = inject(Router);
  private toast = inject(Toast);

  /** null = carregando */
  protected ativa = signal<boolean | null>(null);
  protected ocupado = signal(false);
  protected ativando = signal(false);
  protected excluindo = signal(false);
  protected novo = signal<{ id: string; qr: string; chave: string } | null>(null);
  protected sozinho = () => this.s.membros().length <= 1;
  codigo = '';
  confirmacao = '';

  constructor() {
    this.auth.tem2Etapas().then((v) => this.ativa.set(v), (e) => this.toast.erro(e));
  }

  private async rodar(f: () => Promise<void>) {
    this.ocupado.set(true);
    try {
      await f();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  iniciar() {
    return this.rodar(async () => {
      this.codigo = '';
      this.novo.set(await this.auth.iniciar2Etapas());
      this.ativando.set(true);
    });
  }

  confirmar(id: string) {
    return this.rodar(async () => {
      await this.auth.confirmar2Etapas(id, this.codigo);
      this.ativando.set(false);
      this.ativa.set(true);
      this.toast.ok('Duas etapas ativas. Nos outros aparelhos, o app vai pedir o código.');
    });
  }

  desativar() {
    if (!confirm('Desligar a verificação em duas etapas?')) return;
    return this.rodar(async () => {
      await this.auth.desativar2Etapas();
      this.ativa.set(false);
      this.toast.ok('Duas etapas desligadas');
    });
  }

  copiar(t: string) {
    navigator.clipboard?.writeText(t).then(() => this.toast.ok('Chave copiada'), () => undefined);
  }

  excluir() {
    return this.rodar(async () => {
      await this.auth.excluirConta();
      this.excluindo.set(false);
      this.toast.ok('Conta excluída');
      this.router.navigateByUrl('/apresentacao');
    });
  }
}
