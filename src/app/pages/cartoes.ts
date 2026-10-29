import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addMeses, hoje, mesAtual } from '../core/datas';
import { BrlPipe, MesPipe, pct, soma } from '../core/formato';
import { faturaDoMes, faturaProjetada, fixasNaFatura } from '../core/financas';
import { Cartao, Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

type Futuro = { cartao_id: string; valor: number; fatura_mes: string; data: string; parcelamento_id: string | null };

/** Só mostra quando o ritmo muda o valor da fatura aberta */
function projetar(c: Cartao, gastos: Futuro[], rec: Recorrencia[]) {
  const p = faturaProjetada(c, gastos, rec, hoje());
  return p.projetada > p.atual + 1 ? p : null;
}

interface FormCartao {
  id?: string;
  nome: string;
  fechamento_dia: number;
  vencimento_dia: number;
  limite: number | null;
  cor: string;
  padrao: boolean;
  ativo: boolean;
  paga_mes_anterior: boolean;
}

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, MesPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Cartões</h1>
        <div class="acts">
          <a class="btn ghost sm" routerLink="/importar"><app-icon name="upload_file" [size]="16" />Importar</a>
          <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
        </div>
      </div>

      @for (c of lista(); track c.cartao.id) {
        <article class="card cc" [class.off]="!c.cartao.ativo">
          <div class="topo" [style.background]="c.cartao.cor">
            <div>
              <b>{{ c.cartao.nome }}</b>
              <small>Fecha dia {{ c.cartao.fechamento_dia }} · vence dia {{ c.cartao.vencimento_dia }}</small>
            </div>
            <div class="acts">
              <button type="button" class="star" [class.on]="c.cartao.padrao" (click)="padrao(c.cartao)"
                [attr.aria-label]="c.cartao.padrao ? 'Cartão padrão' : 'Definir como padrão'"><app-icon name="star" [size]="20" [fill]="c.cartao.padrao" /></button>
              <button type="button" class="star" (click)="editar(c.cartao)" aria-label="Editar"><app-icon name="edit" [size]="18" /></button>
            </div>
          </div>

          <div class="corpo">
            <div class="linha">
              <span class="muted small">Fatura de {{ c.faturaRef | mes }}</span>
              <span class="num">
                <b>{{ c.faturaMes | brl }}</b>
                @if (c.pagaMes) { <span class="badge ok">Paga</span> }
              </span>
            </div>

            @if (c.cartao.limite) {
              <div class="linha">
                <span class="muted small">Limite usado</span>
                <span class="num small">{{ c.usado | brl }} de {{ c.cartao.limite | brl }}</span>
              </div>
              <div class="bar" [class.alerta]="c.pctLimite >= 80" [class.estourado]="c.pctLimite >= 100">
                <i [style.width.%]="c.pctLimite > 100 ? 100 : c.pctLimite"></i>
              </div>
              <p class="small muted">Disponível: <b class="num">{{ c.cartao.limite - c.usado | brl }}</b></p>
            }

            @if (c.projecao; as p) {
              <div class="proj">
                <app-icon name="trending_up" [size]="18" />
                <span>Fatura de <b class="cap">{{ p.mes | mes: true }}</b> tem <b class="num">{{ p.atual | brl }}</b>; no ritmo atual fecha em <b class="num">{{ p.projetada | brl }}</b> (dia {{ p.fecha.slice(8) }})</span>
              </div>
            }

            <h3 class="sub">Próximas faturas</h3>
            <div class="faturas">
              @for (f of c.proximas; track f.mes) {
                <div class="fat" [class.zero]="!f.total">
                  <small>{{ f.mes | mes: true }}</small>
                  <b class="num">{{ f.total | brl }}</b>
                </div>
              }
            </div>
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="credit_card" [size]="40" />
          <p>Nenhum cartão cadastrado.</p>
          <button class="btn sm" type="button" (click)="novo()">Cadastrar cartão</button>
        </div>
      }

      <p class="small muted">A estrela marca o cartão padrão, já selecionado ao lançar um gasto. Compras no dia do fechamento ou depois vão para a fatura seguinte.</p>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar cartão' : 'Novo cartão'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" placeholder="Ex.: Nubank" required /></label>
        <div class="grid2">
          <label class="field"><span>Dia do fechamento</span>
            <input name="fech" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="f.fechamento_dia" /></label>
          <label class="field"><span>Dia do vencimento</span>
            <input name="venc" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="f.vencimento_dia" /></label>
        </div>
        <div class="grid2">
          <label class="field"><span>Limite (opcional)</span>
            <input name="limite" type="number" inputmode="decimal" step="0.01" [(ngModel)]="f.limite" /></label>
          <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="f.cor" /></label>
        </div>
        <label class="check"><input type="checkbox" name="padrao" [(ngModel)]="f.padrao" /> Cartão padrão</label>
        <label class="check"><input type="checkbox" name="ant" [(ngModel)]="f.paga_mes_anterior" /> Pagar com o salário do mês anterior</label>
        <p class="small muted">A fatura que vence no dia {{ f.vencimento_dia }} entra nas contas do mês anterior ao vencimento.</p>
        <label class="check"><input type="checkbox" name="ativo" [(ngModel)]="f.ativo" /> Ativo</label>
        <button class="btn block" type="submit" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir cartão</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .cc { padding: 0; overflow: hidden; }
    .cc.off { opacity: 0.55; }
    .topo { color: #fff; padding: 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .topo b { display: block; font-size: 1.05rem; }
    .topo small { opacity: 0.9; font-size: 0.78rem; }
    .acts { display: flex; gap: 4px; }
    .star { background: rgb(255 255 255 / 0.18); border: 0; color: #fff; border-radius: 10px; width: 36px; height: 36px;
      font-size: 1.2rem; cursor: pointer; display: grid; place-items: center; }
    .star.on { background: rgb(255 255 255 / 0.32); }
    .corpo { padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .linha { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .linha .num { display: inline-flex; gap: 6px; align-items: center; }
    .sub { margin-top: 6px; font-size: 0.8rem; color: var(--ink-2); }
    .faturas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .fat { background: var(--card-2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; }
    .fat small { font-size: 0.7rem; color: var(--ink-2); text-transform: capitalize; font-weight: 600; }
    .fat b { font-size: 0.85rem; }
    .fat.zero { opacity: 0.55; }
    .proj { display: flex; gap: 8px; align-items: flex-start; font-size: 0.85rem; color: var(--ink-2); background: var(--card-2); border-radius: 10px; padding: 8px 10px; }
    .proj app-icon { color: var(--primary); }
    .cap { text-transform: capitalize; }
  `,
})
export default class Cartoes {
  protected s = inject(Store);
  private toast = inject(Toast);

  private futuros = signal<Futuro[]>([]);
  private pagas = signal<{ ref_id: string; mes: string }[]>([]);
  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormCartao = this.vazio();

  protected lista = computed(() => {
    const atual = mesAtual();
    const meses = Array.from({ length: 6 }, (_, i) => addMeses(atual, i));
    const pagas = this.pagas();
    return this.s.cartoes().map((cartao) => {
      const dele = this.futuros().filter((g) => g.cartao_id === cartao.id);
      const usado = soma(dele.filter((g) => !pagas.some((p) => p.ref_id === cartao.id && p.mes === g.fatura_mes)), (g) => g.valor);
      const fatura = this.s.contasMes().find((c) => c.tipo === 'fatura' && c.ref_id === cartao.id);
      return {
        cartao,
        usado,
        pctLimite: cartao.limite ? pct(usado, cartao.limite) : 0,
        faturaRef: faturaDoMes(this.s.mes(), cartao),
        faturaMes: fatura?.valor ?? 0,
        pagaMes: !!fatura?.pago,
        projecao: cartao.ativo ? projetar(cartao, dele, this.s.recorrenciasPrev()) : null,
        proximas: meses.map((mes) => ({
          mes,
          total: soma(dele.filter((g) => g.fatura_mes === mes), (g) => g.valor) + soma(fixasNaFatura(mes, cartao, this.s.recorrenciasPrev()), (f) => f.valor),
        })),
      };
    });
  });

  constructor() {
    effect(() => {
      this.s.mudou();
      this.s.cartoes();
      if (this.s.carteiraId()) untracked(() => this.carregar());
    });
  }

  private async carregar() {
    const id = this.s.carteiraId()!;
    const atual = mesAtual();
    try {
      const [g, p] = await Promise.all([
        q<Futuro[]>(
          supabase.from('gastos').select('cartao_id, valor, fatura_mes, data, parcelamento_id').eq('carteira_id', id).eq('forma', 'cartao').gte('fatura_mes', atual),
        ),
        q<{ ref_id: string; mes: string }[]>(
          supabase.from('pagamentos').select('ref_id, mes').eq('carteira_id', id).eq('tipo', 'fatura').gte('mes', atual),
        ),
      ]);
      this.futuros.set(g);
      this.pagas.set(p);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormCartao {
    return { nome: '', fechamento_dia: 1, vencimento_dia: 10, limite: null, cor: '#7c3aed', padrao: !this.s.cartoes().length, ativo: true, paga_mes_anterior: false };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(c: Cartao) {
    this.f = { id: c.id, nome: c.nome, fechamento_dia: c.fechamento_dia, vencimento_dia: c.vencimento_dia, limite: c.limite, cor: c.cor, padrao: c.padrao, ativo: c.ativo, paga_mes_anterior: c.paga_mes_anterior };
    this.aberto.set(true);
  }

  async padrao(c: Cartao) {
    if (c.padrao) return;
    try {
      await this.s.definirPadrao(c.id);
      this.toast.ok(`${c.nome} agora é o padrão`);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async salvar() {
    const f = this.f;
    if (!f.nome.trim()) return this.toast.erro('Informe o nome');
    if (!(f.fechamento_dia >= 1 && f.fechamento_dia <= 31 && f.vencimento_dia >= 1 && f.vencimento_dia <= 31))
      return this.toast.erro('Dias devem estar entre 1 e 31');
    this.salvando.set(true);
    try {
      // padrão só pela RPC: o índice único não deixa dois cartões padrão nem por um instante
      const { padrao, ...dados } = f;
      const id = await this.s.salvar('cartoes', { ...dados, nome: f.nome.trim(), limite: f.limite || null, ...(padrao ? {} : { padrao: false }) });
      if (padrao) await this.s.definirPadrao(id);
      this.toast.ok('Cartão salvo');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('cartoes', this.f.id, 'Cartão excluído');
    this.aberto.set(false);
  }

}
