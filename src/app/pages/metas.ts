import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { diffDias, faltaPara, hoje, iso } from '../core/datas';
import { BrlPipe, DiaPipe, parseValor, pct } from '../core/formato';
import { Meta, MetaCheckin } from '../core/models';
import { Store } from '../core/store';
import { Autor } from '../shared/autor';
import { Icon } from '../shared/icon';
import { Moeda } from '../shared/moeda';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

const HUMORES = [
  { v: 1, e: '😣', r: 'Difícil' },
  { v: 2, e: '😐', r: 'Ok' },
  { v: 3, e: '😄', r: 'Bem' },
] as const;

/** dias sem check-in a partir dos quais a meta pede conversa */
const SEM_CONVERSA = 15;

const diaLocal = (ts: string) => iso(new Date(ts));

/** Metas do casal: progresso pelo cofrinho e check-ins de cada um sobre como está indo */
@Component({
  imports: [FormsModule, Moeda, BrlPipe, DiaPipe, Icon, Sheet, Autor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Metas do casal</h1>
        <button class="btn sm" type="button" (click)="nova()"><app-icon name="add" [size]="16" />Meta</button>
      </div>

      @for (m of ativas(); track m.m.id) {
        <article class="card meta">
          <button type="button" class="cab" (click)="editar(m.m)">
            <span class="grow"><b>{{ m.m.titulo }}</b>
              <span class="small muted">{{ m.cofrinho ? m.cofrinho : 'Sem cofrinho' }}{{ m.m.prazo ? ' · ' + falta(m.m.prazo) : '' }}</span></span>
            @if (m.m.valor) { <b class="num">{{ m.m.valor | brl }}</b> }
          </button>
          @if (m.guardado !== null) {
            @if (m.m.valor) {
              <div class="bar"><i [style.width.%]="m.pct > 100 ? 100 : m.pct"></i></div>
              <p class="small muted">{{ m.guardado | brl }} guardado ({{ m.pct }}%)</p>
            } @else {
              <p class="small muted">{{ m.guardado | brl }} guardado</p>
            }
          }
          @if (m.semConversa) {
            <p class="aviso alerta small"><app-icon class="i" name="forum" [size]="18" />Faz {{ m.semConversa }} dias sem conversar sobre esta meta</p>
          }
          @if (m.checkins.length) {
            <div class="checks">
              @for (c of m.checkins.slice(0, aberta() === m.m.id ? 50 : 3); track c.id) {
                <div class="ck">
                  <app-autor [id]="c.user_id" [size]="22" />
                  <span class="hum" [title]="humor(c.humor).r">{{ humor(c.humor).e }}</span>
                  <span class="grow small"><b>{{ s.nomeAutor(c.user_id) }}</b> <span class="muted">· {{ dia(c.criado_em) | dia }}</span>
                    @if (c.nota) { <span class="nota">{{ c.nota }}</span> }</span>
                  @if (c.user_id === s.eu()) {
                    <button type="button" class="x" (click)="excluirCheckin(c)" aria-label="Excluir check-in"><app-icon name="close" [size]="16" /></button>
                  }
                </div>
              }
              @if (m.checkins.length > 3) {
                <button type="button" class="mais small" (click)="aberta.set(aberta() === m.m.id ? null : m.m.id)">{{ aberta() === m.m.id ? 'Mostrar menos' : 'Ver os ' + m.checkins.length + ' check-ins' }}</button>
              }
            </div>
          }
          <div class="bts">
            <button type="button" class="btn ghost sm" (click)="concluir(m.m)"><app-icon name="check" [size]="16" />Concluir</button>
            <button type="button" class="btn sm" (click)="checkin(m.m)"><app-icon name="mood" [size]="16" />Como estamos?</button>
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="flag" [size]="40" />
          <p>Combinem objetivos juntos: viagem, reserva, quitar uma dívida. Liguem a um cofrinho para ver o progresso e conversem de tempos em tempos pelo check-in.</p>
          <button class="btn sm" type="button" (click)="nova()">Criar meta</button>
        </div>
      }

      @if (concluidas().length) {
        <details class="card">
          <summary class="small"><b>Concluídas ({{ concluidas().length }})</b></summary>
          @for (m of concluidas(); track m.id) {
            <div class="row">
              <div class="grow"><div class="t">{{ m.titulo }}</div><div class="s">concluída {{ m.concluida_em! | dia }}</div></div>
              <button type="button" class="btn ghost sm" (click)="reabrir(m)">Reabrir</button>
            </div>
          }
        </details>
      }
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar meta' : 'Nova meta'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Meta</span><input name="t" maxlength="120" [(ngModel)]="f.titulo" placeholder="Ex.: Viagem de férias" /></label>
        <label class="field"><span>Valor (opcional)</span><input name="v" moeda inputmode="numeric" [(ngModel)]="f.valor" placeholder="0,00" /></label>
        <label class="field"><span>Cofrinho (opcional)</span>
          <select name="c" [(ngModel)]="f.cofrinho_id">
            <option [ngValue]="null">Nenhum</option>
            @for (c of s.cofrinhos(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
        <label class="field"><span>Prazo (opcional)</span><input name="p" type="date" [(ngModel)]="f.prazo" /></label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (f.id) { <button class="btn danger block" type="button" (click)="excluir()">Excluir</button> }
      </form>
    </app-sheet>

    <app-sheet [(open)]="checando" [titulo]="'Como estamos? · ' + (metaCheck()?.titulo ?? '')">
      <form class="form" (ngSubmit)="salvarCheckin()">
        <div class="seg">
          @for (h of humores; track h.v) {
            <button type="button" [class.on]="ck.humor === h.v" (click)="ck.humor = h.v"><span class="hum">{{ h.e }}</span>{{ h.r }}</button>
          }
        </div>
        <label class="field"><span>Nota (opcional)</span><textarea name="n" rows="3" maxlength="500" [(ngModel)]="ck.nota" placeholder="O que ajudou, o que atrapalhou, o que combinar"></textarea></label>
        <button class="btn block" [disabled]="salvando()">Registrar</button>
      </form>
    </app-sheet>
  `,
  styles: `
    .meta { display: flex; flex-direction: column; gap: 8px; }
    .cab { display: flex; align-items: center; gap: 10px; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 0; width: 100%; }
    .cab .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .bar { height: 6px; }
    p { margin: 0; }
    .aviso { align-items: center; }
    .checks { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
    .ck { display: flex; align-items: flex-start; gap: 6px; }
    .ck .grow { flex: 1; min-width: 0; }
    .nota { display: block; color: var(--ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
    .hum { font-size: 1.1rem; line-height: 1.3; }
    .x, .mais { border: 0; background: none; color: var(--ink-3); cursor: pointer; padding: 2px; font: inherit; }
    .mais { color: var(--primary); font-weight: 700; align-self: flex-start; }
    .bts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    summary { cursor: pointer; }
    textarea { resize: vertical; }
  `,
})
export default class Metas {
  protected s = inject(Store);
  private toast = inject(Toast);
  protected humores = HUMORES;
  protected aberto = signal(false);
  protected checando = signal(false);
  protected salvando = signal(false);
  /** meta com todos os check-ins à mostra */
  protected aberta = signal<string | null>(null);
  protected metaCheck = signal<Meta | null>(null);
  f: { id?: string; titulo: string; valor: string; cofrinho_id: string | null; prazo: string } = this.vazio();
  ck: { humor: 1 | 2 | 3; nota: string } = { humor: 2, nota: '' };

  protected dia = diaLocal;
  protected falta = (prazo: string) => faltaPara(prazo);
  protected humor = (v: number) => HUMORES[v - 1] ?? HUMORES[1];

  private porMeta = computed(() => {
    const m = new Map<string, MetaCheckin[]>();
    for (const c of this.s.metaCheckins()) m.set(c.meta_id, [...(m.get(c.meta_id) ?? []), c]);
    for (const l of m.values()) l.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    return m;
  });

  protected ativas = computed(() => {
    const d = hoje();
    return this.s
      .metas()
      .filter((m) => !m.concluida_em)
      .sort((a, b) => (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') || a.criado_em.localeCompare(b.criado_em))
      .map((m) => {
        const checkins = this.porMeta().get(m.id) ?? [];
        const guardado = m.cofrinho_id ? (this.s.guardadoPorCofrinho().get(m.cofrinho_id) ?? 0) : null;
        const dias = diffDias(diaLocal(checkins[0]?.criado_em ?? m.criado_em), d);
        return {
          m,
          checkins,
          guardado,
          pct: m.valor ? pct(guardado ?? 0, m.valor) : 0,
          cofrinho: m.cofrinho_id ? this.s.cofrinhos().find((c) => c.id === m.cofrinho_id)?.nome : undefined,
          semConversa: dias > SEM_CONVERSA ? dias : 0,
        };
      });
  });
  protected concluidas = computed(() => this.s.metas().filter((m) => m.concluida_em).sort((a, b) => b.concluida_em!.localeCompare(a.concluida_em!)));

  private vazio() {
    return { titulo: '', valor: '', cofrinho_id: null, prazo: '' };
  }

  nova() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(m: Meta) {
    this.f = { id: m.id, titulo: m.titulo, valor: m.valor ? String(m.valor).replace('.', ',') : '', cofrinho_id: m.cofrinho_id, prazo: m.prazo ?? '' };
    this.aberto.set(true);
  }

  async salvar() {
    const titulo = this.f.titulo.trim();
    if (!titulo) return this.toast.erro('Informe a meta');
    this.salvando.set(true);
    try {
      const { id, cofrinho_id, prazo } = this.f;
      await this.s.salvar('metas', { id, titulo, valor: parseValor(this.f.valor) || null, cofrinho_id, prazo: prazo || null });
      this.aberto.set(false);
      this.toast.ok('Meta salva');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('metas', this.f.id, 'Meta excluída');
    this.aberto.set(false);
  }

  async concluir(m: Meta) {
    try {
      await this.s.salvar('metas', { id: m.id, concluida_em: hoje() });
      this.toast.feito(`${m.titulo} concluída 🎉`, () => this.s.salvar('metas', { id: m.id, concluida_em: null }));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async reabrir(m: Meta) {
    try {
      await this.s.salvar('metas', { id: m.id, concluida_em: null });
      this.toast.ok('Meta reaberta');
    } catch (e) {
      this.toast.erro(e);
    }
  }

  checkin(m: Meta) {
    this.metaCheck.set(m);
    this.ck = { humor: 2, nota: '' };
    this.checando.set(true);
  }

  async salvarCheckin() {
    const m = this.metaCheck();
    if (!m) return;
    this.salvando.set(true);
    try {
      await this.s.salvar('meta_checkins', { meta_id: m.id, humor: this.ck.humor, nota: this.ck.nota.trim().slice(0, 500) || null });
      this.checando.set(false);
      this.toast.ok('Check-in registrado');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluirCheckin(c: MetaCheckin) {
    this.s.excluirAdiado('meta_checkins', c.id, 'Check-in excluído');
  }
}
