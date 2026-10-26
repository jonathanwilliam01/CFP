import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { mesAtual } from '../core/datas';
import { saldoBeneficio } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, pct } from '../core/formato';
import { Beneficio } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormBeneficio {
  id?: string;
  nome: string;
  valor_mensal: number | null;
  dia_credito: number;
  acumula: boolean;
  inicio: string;
  ativo: boolean;
}

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Benefícios</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
      </div>

      <p class="small muted">Gastos e contas fixas pagos com benefício (VR, VA...) são descontados do saldo dele e não entram nas saídas do mês. Escolha o benefício em “Pagamento” ao lançar ou cadastrar a conta fixa.</p>

      @for (b of lista(); track b.beneficio.id) {
        <article class="card" [class.off]="!b.beneficio.ativo">
          <div class="card-head">
            <div>
              <h2 class="tit"><app-icon name="restaurant" [size]="20" />{{ b.beneficio.nome }}</h2>
              <p class="small muted">{{ b.beneficio.valor_mensal | brl }}/mês · crédito dia {{ b.beneficio.dia_credito }}{{ b.beneficio.acumula ? ' · acumula' : '' }}</p>
            </div>
            <button class="btn ghost icon" type="button" (click)="editar(b.beneficio)" aria-label="Editar"><app-icon name="edit" [size]="18" /></button>
          </div>

          <div class="saldo">
            <span class="muted small">Saldo em {{ s.mes() | mes }}</span>
            <b class="num" [class.neg]="b.saldo < 0">{{ b.saldo | brl }}</b>
          </div>
          <div class="bar" [class.alerta]="b.pct >= 80" [class.estourado]="b.pct >= 100">
            <i [style.width.%]="b.pct > 100 ? 100 : b.pct"></i>
          </div>
          <p class="small muted">Usado no mês: <b class="num">{{ b.usadoMes | brl }}</b></p>

          @if (b.gastos.length || b.contas.length) {
            <div class="list">
              @for (c of b.contas; track c.ref_id) {
                <a class="row" routerLink="/contas">
                  <span class="ico"><app-icon [name]="c.icone" /></span>
                  <span class="grow"><span class="t">{{ c.descricao }}</span><span class="s">Conta fixa · vence {{ c.vencimento | dia }}{{ c.pago ? ' · paga' : '' }}</span></span>
                  <span class="v">{{ c.valor | brl }}</span>
                </a>
              }
              @for (g of b.gastos; track g.id) {
                <button type="button" class="row" (click)="lancar.editarGasto(g)">
                  <span class="ico"><app-icon [name]="s.catMap().get(g.categoria_id ?? '')?.icone ?? 'restaurant'" /></span>
                  <span class="grow"><span class="t">{{ g.descricao }}</span><span class="s">{{ g.data | dia }}</span></span>
                  <span class="v">{{ g.valor | brl }}</span>
                </button>
              }
            </div>
          }
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="restaurant" [size]="40" />
          <p>Nenhum benefício cadastrado.</p>
          <button class="btn sm" type="button" (click)="novo()">Cadastrar benefício</button>
        </div>
      }
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar benefício' : 'Novo benefício'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" placeholder="Ex.: Vale-refeição" /></label>
        <div class="grid2">
          <label class="field"><span>Valor mensal</span>
            <input name="valor" type="number" inputmode="decimal" step="0.01" [(ngModel)]="f.valor_mensal" /></label>
          <label class="field"><span>Dia do crédito</span>
            <input name="dia" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="f.dia_credito" /></label>
        </div>
        <label class="field"><span>Começou em</span><input name="inicio" type="date" [(ngModel)]="f.inicio" /></label>
        <label class="check"><input type="checkbox" name="acumula" [(ngModel)]="f.acumula" /> Saldo acumula de um mês para o outro</label>
        <label class="check"><input type="checkbox" name="ativo" [(ngModel)]="f.ativo" /> Ativo</label>
        <button class="btn block" type="submit" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir benefício</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .off { opacity: 0.55; }
    .saldo { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .saldo b { font-size: 1.4rem; font-weight: 800; }
    .bar { margin-bottom: 6px; }
    .list { margin-top: 8px; border-top: 1px solid var(--line); }
  `,
})
export default class Beneficios {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);
  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormBeneficio = this.vazio();

  protected lista = computed(() =>
    this.s.beneficios().map((b) => {
      const { saldo, usadoMes } = saldoBeneficio(b, this.s.usoBeneficios(), this.s.mes(), this.s.cobrancasBeneficio());
      const disponivel = saldo + usadoMes;
      return {
        beneficio: b,
        saldo,
        usadoMes,
        pct: pct(usadoMes, disponivel),
        gastos: this.s.gastosMes().filter((g) => g.forma === 'beneficio' && g.beneficio_id === b.id),
        contas: this.s.contasMes().filter((c) => c.beneficio_id === b.id),
      };
    }),
  );

  private vazio(): FormBeneficio {
    return { nome: '', valor_mensal: null, dia_credito: 1, acumula: true, inicio: mesAtual(), ativo: true };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(b: Beneficio) {
    this.f = { id: b.id, nome: b.nome, valor_mensal: b.valor_mensal, dia_credito: b.dia_credito, acumula: b.acumula, inicio: b.inicio, ativo: b.ativo };
    this.aberto.set(true);
  }

  async salvar() {
    const f = this.f;
    if (!f.nome.trim()) return this.toast.erro('Informe o nome');
    this.salvando.set(true);
    try {
      await this.s.salvar('beneficios', { ...f, nome: f.nome.trim(), valor_mensal: f.valor_mensal ?? 0, inicio: f.inicio || mesAtual() });
      this.toast.ok('Benefício salvo');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async excluir() {
    if (!this.f.id || !confirm('Excluir este benefício?')) return;
    try {
      await this.s.excluir('beneficios', this.f.id);
      this.toast.ok('Benefício excluído');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
