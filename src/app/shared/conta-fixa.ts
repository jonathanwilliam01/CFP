import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMeses, diaNoMes, hoje, mesAtual, mesFatura } from '../core/datas';
import { MAX_MEDIA, MIN_MEDIA, mediaContas } from '../core/financas';
import { BrlPipe, MesPipe, parseValor } from '../core/formato';
import { Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { Icon } from './icon';
import { Reajuste } from './reajuste';
import { Toast } from './toast';

interface FormFixa {
  id?: string;
  descricao: string;
  valor: string;
  dia: number;
  categoria_id: string | null;
  inicio: string;
  fim: string;
  ativo: boolean;
  cartao_id: string | null;
  variavel: boolean;
  paga_mes_anterior: boolean;
  beneficio_id: string | null;
  hist: { id?: string; mes: string; valor: number }[];
  removidos: string[];
}

/** Cadastro/edição de conta fixa (tela de contas e lançamento) */
@Component({
  selector: 'app-conta-fixa',
  imports: [FormsModule, BrlPipe, MesPipe, Icon, Reajuste],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" (ngSubmit)="salvar()">
      <label class="field"><span>Descrição</span><input name="d" [ngModel]="f().descricao" (ngModelChange)="set('descricao', $event)" placeholder="Ex.: Aluguel, Internet" /></label>
      <label class="field"><span>Pagamento</span>
        <select name="pg" [ngModel]="f().cartao_id ?? (f().beneficio_id ? 'b:' + f().beneficio_id : null)" (ngModelChange)="trocarPagamento($event)">
          <option [ngValue]="null">Boleto/Débito/Pix</option>
          @for (c of s.cartoesAtivos(); track c.id) { <option [ngValue]="c.id">Cartão {{ c.nome }}</option> }
          @for (b of s.beneficiosAtivos(); track b.id) { <option [ngValue]="'b:' + b.id">{{ b.nome }}</option> }
        </select>
      </label>
      <label class="check"><input name="var" type="checkbox" [ngModel]="f().variavel" (ngModelChange)="set('variavel', $event)" />Valor variável (ex.: luz, água)</label>
      <div class="grid2">
        <label class="field"><span>{{ f().variavel ? 'Valor estimado' : 'Valor (previsto)' }}</span><input name="v" inputmode="decimal" [ngModel]="f().valor" (ngModelChange)="set('valor', $event)" /></label>
        @if (!f().cartao_id) {
          <label class="field"><span>Dia do vencimento</span><input name="dia" type="number" min="1" max="31" [ngModel]="f().dia" (ngModelChange)="set('dia', $event)" /></label>
        }
      </div>
      @if (f().id) {
        <p class="small muted">Mudar o valor aqui troca todos os meses. Para mudar só a partir de um mês, use o reajuste abaixo.</p>
      }
      @if (f().cartao_id) {
        <p class="small muted">Entra em todas as faturas a partir da primeira, vence junto com a fatura e é paga com ela.</p>
      } @else if (f().beneficio_id) {
        <p class="small muted">Descontada do saldo do benefício todo mês, não entra nas saídas do mês.</p>
      } @else {
        <label class="check"><input name="ant" type="checkbox" [ngModel]="f().paga_mes_anterior" (ngModelChange)="set('paga_mes_anterior', $event)" />Pagar com o salário do mês anterior</label>
        @if (f().paga_mes_anterior) {
          <p class="small muted">Entra nas contas e saídas do mês anterior ao vencimento (ex.: vence 07/11, conta em outubro).</p>
        }
      }
      @if (f().variavel) {
        <div class="hist">
          <div class="card-head">
            <h3>Últimas contas</h3>
            @if (mediaForm(); as m) {
              <span class="badge info">Média {{ m | brl }}</span>
            } @else {
              <span class="badge">Faltam {{ minMedia - f().hist.length }} p/ média</span>
            }
          </div>
          <p class="small muted">A previsão usa a média das últimas {{ maxMedia }} contas (mínimo {{ minMedia }}). Contas pagas entram sozinhas; inclua as anteriores aqui.</p>
          @for (h of f().hist; track h.mes) {
            <div class="it">
              <span>{{ h.mes | mes }}</span>
              <span class="tit"><span class="num">{{ h.valor | brl }}</span>
                <button type="button" class="btn ghost icon sm" (click)="removerHist(h)" aria-label="Remover"><app-icon name="delete" [size]="18" /></button>
              </span>
            </div>
          }
          <div class="add">
            <input name="hm" type="month" [max]="mesAtualCurto" [(ngModel)]="histMes" />
            <input name="hv" inputmode="decimal" placeholder="Valor" [(ngModel)]="histValor" />
            <button type="button" class="btn ghost icon" (click)="adicionarHist()" aria-label="Adicionar conta"><app-icon name="add" /></button>
          </div>
        </div>
      }
      <label class="field"><span>Categoria</span>
        <select name="c" [ngModel]="f().categoria_id" (ngModelChange)="set('categoria_id', $event)">
          <option [ngValue]="null">Sem categoria</option>
          @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
        </select>
      </label>
      <div class="grid2">
        <label class="field"><span>{{ f().cartao_id ? 'Primeira fatura' : 'A partir de' }}</span><input name="i" type="month" [ngModel]="f().inicio" (ngModelChange)="set('inicio', $event)" /></label>
        <label class="field"><span>Até (opcional)</span><input name="f" type="month" [ngModel]="f().fim" (ngModelChange)="set('fim', $event)" /></label>
      </div>
      <label class="check"><input name="a" type="checkbox" [ngModel]="f().ativo" (ngModelChange)="set('ativo', $event)" />Ativa</label>
      @if (rec(); as r) {
        <app-reajuste [rec]="r" (feito)="fechar.emit()" />
      }
      <button class="btn block" type="submit">Salvar</button>
      @if (f().id) {
        <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
      }
    </form>
  `,
  styles: `
    .hist { border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .it { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
    .it:last-child { border-bottom: 0; }
    .add { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 4px; }
  `,
})
export class ContaFixa implements OnInit {
  protected s = inject(Store);
  private toast = inject(Toast);

  readonly rec = input<Recorrencia | null>(null);
  readonly fechar = output();

  protected f = signal<FormFixa>(this.vazio());
  protected histMes = '';
  protected histValor = '';
  protected minMedia = MIN_MEDIA;
  protected maxMedia = MAX_MEDIA;
  protected mesAtualCurto = mesAtual().slice(0, 7);

  ngOnInit() {
    const r = this.rec();
    if (r)
      this.f.set({
        id: r.id, descricao: r.descricao, valor: String(r.valor).replace('.', ','), dia: r.dia, categoria_id: r.categoria_id,
        inicio: r.inicio.slice(0, 7), fim: r.fim?.slice(0, 7) ?? '', ativo: r.ativo, cartao_id: r.cartao_id ?? null,
        variavel: r.variavel, paga_mes_anterior: r.paga_mes_anterior, beneficio_id: r.beneficio_id ?? null, removidos: [],
        hist: this.s.valoresFixas().filter((v) => v.ref_id === r.id).map(({ id, mes, valor }) => ({ id, mes, valor })),
      });
    this.proximoHist();
  }

  private vazio(): FormFixa {
    return {
      descricao: '', valor: '', dia: 10, categoria_id: null, inicio: mesAtual().slice(0, 7), fim: '', ativo: true, cartao_id: null,
      variavel: false, paga_mes_anterior: false, beneficio_id: null, hist: [], removidos: [],
    };
  }

  set<K extends keyof FormFixa>(k: K, v: FormFixa[K]) {
    this.f.update((f) => ({ ...f, [k]: v }));
  }

  // nova conta no cartão começa na fatura aberta; benefício vem como 'b:<id>'
  trocarPagamento(v: string | null) {
    const id = v?.startsWith('b:') ? null : v;
    const c = this.s.cartoes().find((x) => x.id === id);
    this.f.update((f) => ({
      ...f,
      beneficio_id: v?.startsWith('b:') ? v.slice(2) : null,
      cartao_id: id,
      inicio: f.id ? f.inicio : (c ? mesFatura(hoje(), c.fechamento_dia, c.vencimento_dia) : mesAtual()).slice(0, 7),
    }));
  }

  async salvar() {
    const f = this.f();
    const media = f.variavel ? this.mediaForm() : null;
    if (!f.descricao.trim()) return this.toast.erro('Preencha a descrição');
    if (!parseValor(f.valor) && !media) return this.toast.erro(f.variavel ? `Informe um valor estimado ou ao menos ${MIN_MEDIA} contas` : 'Preencha o valor');
    try {
      const dia = this.s.cartoes().find((c) => c.id === f.cartao_id)?.vencimento_dia ?? (f.dia || 1);
      const id = await this.s.salvar('recorrencias', {
        id: f.id, tipo: 'conta', descricao: f.descricao.trim(), valor: parseValor(f.valor) || media || 0, dia,
        categoria_id: f.categoria_id, inicio: `${f.inicio || mesAtual().slice(0, 7)}-01`, fim: f.fim ? `${f.fim}-01` : null, ativo: f.ativo,
        cartao_id: f.cartao_id, variavel: f.variavel, paga_mes_anterior: !f.cartao_id && !f.beneficio_id && f.paga_mes_anterior,
        beneficio_id: f.cartao_id ? null : f.beneficio_id,
      });
      if (f.variavel) {
        const novos = f.hist.filter((h) => !h.id).map((h) => ({ mes: h.mes, valor: h.valor, pago_em: diaNoMes(h.mes, dia) }));
        await this.s.salvarValores(id, novos, f.removidos);
      }
      this.toast.ok('Conta fixa salva');
      this.fechar.emit();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  mediaForm() {
    return mediaContas(this.f().hist);
  }

  /** sugere o mês anterior ao mais antigo já informado */
  private proximoHist() {
    const ant = this.f().hist.map((h) => h.mes).sort()[0];
    this.histMes = addMeses(ant ?? mesAtual(), -1).slice(0, 7);
    this.histValor = '';
  }

  adicionarHist() {
    const valor = parseValor(this.histValor);
    if (!this.histMes || !valor) return this.toast.erro('Informe mês e valor');
    const mes = `${this.histMes}-01`;
    this.f.update((f) => {
      const atual = f.hist.find((h) => h.mes === mes);
      return {
        ...f,
        removidos: atual?.id ? [...f.removidos, atual.id] : f.removidos,
        hist: [...f.hist.filter((h) => h.mes !== mes), { mes, valor }].sort((a, b) => b.mes.localeCompare(a.mes)),
      };
    });
    this.proximoHist();
  }

  removerHist(h: { id?: string; mes: string }) {
    this.f.update((f) => ({ ...f, removidos: h.id ? [...f.removidos, h.id] : f.removidos, hist: f.hist.filter((x) => x.mes !== h.mes) }));
  }

  excluir() {
    this.s.excluirAdiado('recorrencias', this.f().id!, 'Conta fixa excluída');
    this.fechar.emit();
  }
}
