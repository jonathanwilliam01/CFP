import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { hoje, inicioMes, parse } from '../core/datas';
import { BrlPipe, MesPipe, parseValor, soma } from '../core/formato';
import { RegistroItem } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { IconePicker } from '../shared/icone-picker';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, MesPipe, Icon, IconePicker, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <a routerLink="/registros" class="btn ghost icon" aria-label="Voltar"><app-icon name="chevron_left" [size]="18" /></a>
        <h1 class="grow tit">@if (r(); as x) {<app-icon [name]="x.icone" [size]="26" [style.color]="x.cor" />}{{ r()?.nome ?? 'Registro' }}</h1>
        @if (r()) {
          <button class="btn ghost icon" type="button" (click)="exportar()" aria-label="Exportar CSV"><app-icon name="download" [size]="18" /></button>
          <button class="btn ghost icon" type="button" (click)="editarRegistro()" aria-label="Editar"><app-icon name="edit" [size]="18" /></button>
        }
      </div>

      @if (r()) {
        <div class="stats">
          <div class="stat"><div class="l">Total</div><div class="v">{{ total() | brl }}</div></div>
          <div class="stat"><div class="l">Itens</div><div class="v">{{ itens().length }}</div></div>
        </div>

        <button class="btn block" type="button" (click)="novoItem()"><app-icon name="add" [size]="18" />Adicionar item</button>

        @for (g of grupos(); track g.mes) {
          <div class="card">
            <div class="card-head">
              <h3 class="cap">{{ g.mes | mes }}</h3>
              <b class="num">{{ g.total | brl }}</b>
            </div>
            <div class="list">
              @for (i of g.itens; track i.id) {
                <button class="row" type="button" (click)="editarItem(i)">
                  <div class="grow">
                    <div class="t">{{ i.descricao }}</div>
                    <div class="s">{{ dataCurta(i.data) }}{{ i.obs ? ' · ' + i.obs : '' }}</div>
                  </div>
                  <div class="v">{{ i.valor | brl }}</div>
                </button>
              }
            </div>
          </div>
        } @empty {
          <div class="card empty"><app-icon class="big" [name]="r()?.icone ?? 'menu_book'" [size]="40" /><p>Nenhum item ainda.</p></div>
        }
      } @else {
        <div class="card empty"><app-icon class="big" name="menu_book" [size]="40" /><p>Registro não encontrado.</p></div>
      }
    </div>

    <app-sheet [(open)]="itemAberto" [titulo]="it.id ? 'Editar item' : 'Novo item'">
      <form class="form" (ngSubmit)="salvarItem()">
        <label class="field"><span>Descrição</span><input name="descricao" [(ngModel)]="it.descricao" placeholder="Ex.: Troca de óleo" /></label>
        <div class="grid2">
          <label class="field"><span>Valor (R$)</span><input name="valor" inputmode="decimal" [(ngModel)]="it.valor" placeholder="0,00" /></label>
          <label class="field"><span>Data</span><input name="data" type="date" [(ngModel)]="it.data" /></label>
        </div>
        <label class="field"><span>Observação</span><textarea name="obs" rows="2" [(ngModel)]="it.obs" placeholder="Ex.: km 45.000"></textarea></label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (it.id) {
          <button class="btn danger block" type="button" (click)="excluirItem()">Excluir item</button>
        }
      </form>
    </app-sheet>

    <app-sheet [(open)]="regAberto" titulo="Editar registro">
      <form class="form" (ngSubmit)="salvarRegistro()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" /></label>
        <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="f.cor" /></label>
        <div class="field"><span>Ícone</span><app-icone-picker [(valor)]="f.icone" [cor]="f.cor" /></div>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        <button class="btn danger block" type="button" (click)="excluirRegistro()">Excluir registro</button>
      </form>
    </app-sheet>
  `,
  styles: `
    .grow { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cap { text-transform: capitalize; }
  `,
})
export default class Registro {
  readonly id = input.required<string>();
  protected s = inject(Store);
  private toast = inject(Toast);
  private router = inject(Router);

  protected itens = signal<RegistroItem[]>([]);
  protected itemAberto = signal(false);
  protected regAberto = signal(false);
  protected salvando = signal(false);
  it = { id: '', descricao: '', valor: '', data: hoje(), obs: '' };
  f = { nome: '', icone: '', cor: '' };

  protected r = computed(() => this.s.registros().find((x) => x.id === this.id()) ?? null);
  protected total = computed(() => soma(this.itens(), (i) => i.valor));
  protected grupos = computed(() => {
    const m = new Map<string, RegistroItem[]>();
    for (const i of this.itens()) {
      const k = inicioMes(i.data);
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()].map(([mes, itens]) => ({ mes, itens, total: soma(itens, (i) => i.valor) }));
  });

  constructor() {
    effect(() => {
      this.s.mudou();
      const id = this.id();
      if (this.s.carteiraId()) untracked(() => this.carregar(id));
    });
  }

  private async carregar(id = this.id()) {
    try {
      this.itens.set(
        await q<RegistroItem[]>(
          supabase.from('registro_itens').select('*').eq('registro_id', id)
            .order('data', { ascending: false }).order('id'),
        ),
      );
    } catch (e) {
      this.toast.erro(e);
    }
  }

  dataCurta(d: string) {
    return parse(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  novoItem() {
    this.it = { id: '', descricao: '', valor: '', data: hoje(), obs: '' };
    this.itemAberto.set(true);
  }

  editarItem(i: RegistroItem) {
    this.it = { id: i.id, descricao: i.descricao, valor: String(i.valor).replace('.', ','), data: i.data, obs: i.obs ?? '' };
    this.itemAberto.set(true);
  }

  async salvarItem() {
    if (!this.it.descricao.trim()) return this.toast.erro('Informe a descrição');
    this.salvando.set(true);
    try {
      await this.s.salvar('registro_itens', {
        id: this.it.id || undefined,
        registro_id: this.id(),
        descricao: this.it.descricao.trim(),
        valor: parseValor(this.it.valor),
        data: this.it.data,
        obs: this.it.obs.trim() || null,
      });
      await this.carregar();
      this.toast.ok('Salvo');
      this.itemAberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluirItem() {
    const id = this.it.id;
    this.itens.update((l) => l.filter((x) => x.id !== id));
    this.s.excluirAdiado('registro_itens', id, 'Item excluído', () => this.carregar());
    this.itemAberto.set(false);
  }

  editarRegistro() {
    const r = this.r()!;
    this.f = { nome: r.nome, icone: r.icone, cor: r.cor };
    this.regAberto.set(true);
  }

  async salvarRegistro() {
    if (!this.f.nome.trim()) return this.toast.erro('Informe o nome');
    this.salvando.set(true);
    try {
      await this.s.salvar('registros', { id: this.id(), nome: this.f.nome.trim(), icone: this.f.icone || 'menu_book', cor: this.f.cor });
      this.toast.ok('Salvo');
      this.regAberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async excluirRegistro() {
    if (!confirm('Excluir o registro e todos os itens?')) return;
    try {
      await this.s.excluir('registros', this.id());
      this.toast.ok('Registro excluído');
      this.router.navigateByUrl('/registros');
    } catch (e) {
      this.toast.erro(e);
    }
  }

  exportar() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const linhas = [
      'Data;Descrição;Valor;Observação',
      ...this.itens().map((i) => [i.data, esc(i.descricao), String(i.valor).replace('.', ','), esc(i.obs ?? '')].join(';')),
    ];
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.r()?.nome ?? 'registro'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
