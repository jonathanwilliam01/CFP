import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Admin } from '../../core/admin';
import { statusComunicado } from '../../core/comunicados';
import { FUNCOES, Funcoes } from '../../core/funcoes';
import { Comunicado, ComunicadoTag } from '../../core/models';
import { NOTAS } from '../../core/versao';
import { Icon } from '../../shared/icon';
import { Toast } from '../../shared/toast';
import { AvisoForm, avisoDaVersao } from './aviso-form';

const ROTULO = { no_ar: 'no ar', agendado: 'agendado', rascunho: 'rascunho', expirado: 'expirado' };

@Component({
  imports: [DatePipe, Icon, AvisoForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top">
      <h2>{{ form() ? (form()!.id ? 'Editar aviso' : 'Novo aviso') : 'Avisos' }}</h2>
      @if (!form()) { <button type="button" class="btn" (click)="novo()"><app-icon name="add" [size]="16" />Novo aviso</button> }
    </div>

    @if (form(); as f) {
      <app-aviso-form [aviso]="f" [tags]="tags()" (salvo)="fechar(true)" (cancelar)="fechar(false)" (tagCriada)="carregar()" />
    } @else {
      <nav class="seg" aria-label="Seção">
        <button type="button" [class.on]="aba() === 'avisos'" (click)="aba.set('avisos')">Avisos</button>
        <button type="button" [class.on]="aba() === 'tags'" (click)="aba.set('tags')">Tags</button>
      </nav>

      @if (aba() === 'avisos') {
        <div class="c">
          @for (c of lista(); track c.id) {
            @let s = c.status;
            <div class="lin">
              <div class="info">
                <div class="l1">
                  @if (c.tag; as t) { <span class="tag" [style.color]="t.cor" [style.background]="'color-mix(in srgb, ' + t.cor + ' 15%, transparent)'">{{ t.nome }}</span> }
                  <strong>{{ c.titulo }}</strong>
                  <span class="pill" [class]="s">{{ rotulo[s] }}</span>
                </div>
                <div class="note">{{ c.inicio | date: 'dd/MM HH:mm' }} a {{ c.fim | date: 'dd/MM HH:mm' }}@if (s !== 'rascunho') { · lido por {{ c.lidos ?? 0 }} de {{ c.total_usuarios ?? 0 }} }</div>
              </div>
              <div class="acoes">
                <button type="button" class="btn ghost" (click)="editar(c)" [attr.aria-label]="'Editar ' + c.titulo">Editar</button>
                <button type="button" class="btn ghost" (click)="duplicar(c)" [attr.aria-label]="'Duplicar ' + c.titulo">Duplicar</button>
                @if (s === 'no_ar') { <button type="button" class="btn ghost" (click)="encerrar(c)" [disabled]="ocupado()">Encerrar agora</button> }
                @if (s === 'rascunho') { <button type="button" class="btn ghost perigo" (click)="excluir(c)" [disabled]="ocupado()">Excluir</button> }
              </div>
            </div>
          } @empty {
            <div class="note vazio">{{ carregado() ? 'Nenhum aviso ainda.' : 'Carregando…' }}</div>
          }
        </div>
      } @else {
        <div class="c">
          @for (t of tags(); track t.id) {
            <div class="lin tg" [class.arq]="t.arquivada">
              <input type="color" [value]="t.cor" [attr.aria-label]="'Cor de ' + t.nome" (change)="salvarTag({ ...t, cor: $any($event.target).value })" />
              <input type="text" [value]="t.nome" [attr.aria-label]="'Nome da tag ' + t.nome" (change)="renomear(t, $any($event.target))" />
              <button type="button" class="btn ghost" (click)="salvarTag({ ...t, arquivada: !t.arquivada })">{{ t.arquivada ? 'Restaurar' : 'Arquivar' }}</button>
            </div>
          }
          <div class="lin tg">
            <input type="color" aria-label="Cor da nova tag" [value]="novaCor()" (input)="novaCor.set($any($event.target).value)" />
            <input type="text" placeholder="Nova tag" aria-label="Nome da nova tag" [value]="novaNome()" (input)="novaNome.set($any($event.target).value)" (keydown.enter)="criarTag()" />
            <button type="button" class="btn" (click)="criarTag()" [disabled]="!novaNome().trim()">Criar</button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    h2 { margin: 0; font-size: 20px; }
    .top .btn { display: inline-flex; gap: 6px; align-items: center; }
    .seg { display: flex; gap: 6px; margin-bottom: 12px; }
    .seg button { border: 0; background: var(--card); color: var(--ink-2); padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 13px; }
    .seg button.on { background: var(--primary); color: #fff; }
    .c { background: var(--card); border-radius: var(--radius); padding: 4px 14px; box-shadow: var(--shadow); }
    .lin { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
    .lin:last-child { border-bottom: 0; }
    .info { min-width: 0; flex: 1 1 260px; }
    .l1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; }
    .note { font-size: 12px; color: var(--ink-3); margin-top: 3px; }
    .vazio { padding: 16px 0; text-align: center; }
    .tag { font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
    .pill { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: var(--line); color: var(--ink-3); }
    .pill.no_ar { background: var(--ok-soft); color: var(--ok); }
    .pill.agendado { background: var(--info-soft); color: var(--info); }
    .pill.rascunho { background: var(--warn-soft); color: var(--warn); }
    .acoes { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn.ghost { font-size: 12px; padding: 5px 10px; }
    .btn.perigo { color: var(--danger); }
    .tg { justify-content: flex-start; flex-wrap: nowrap; }
    .tg input[type='text'] { flex: 1; min-width: 0; }
    .tg.arq { opacity: 0.55; }
  `,
})
export default class AdminAvisos implements OnInit {
  private admin = inject(Admin);
  private toast = inject(Toast);
  private rota = inject(ActivatedRoute);
  private funcoes = inject(Funcoes);

  protected rotulo = ROTULO;
  protected aba = signal<'avisos' | 'tags'>('avisos');
  protected todos = signal<Comunicado[]>([]);
  protected tags = signal<ComunicadoTag[]>([]);
  protected form = signal<Partial<Comunicado> | null>(null);
  protected carregado = signal(false);
  protected ocupado = signal(false);
  protected novaNome = signal('');
  protected novaCor = signal('#1d5bd8');

  protected lista = computed(() => {
    const t = new Map(this.tags().map((x) => [x.id, x]));
    const agora = new Date();
    return this.todos().map((c) => ({ ...c, tag: (c.tag_id && t.get(c.tag_id)) || null, status: statusComunicado(c, agora) }));
  });

  async ngOnInit() {
    await this.carregar();
    this.abrirDaUrl();
  }

  async carregar() {
    try {
      const [c, t] = await Promise.all([this.admin.comunicados(), this.admin.tags()]);
      this.todos.set(c);
      this.tags.set(t);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.carregado.set(true);
    }
  }

  private abrirDaUrl() {
    const p = this.rota.snapshot.queryParamMap;
    const tag = (nome: string) => this.tags().find((t) => t.nome === nome)?.id ?? null;
    if (p.get('novo') === 'versao') {
      const n = NOTAS.find((x) => x.versao === p.get('v'));
      if (n) this.form.set({ ...avisoDaVersao(n), tag_id: tag('Nova versão') });
    } else if (p.get('novo') === 'manutencao') {
      const f = FUNCOES.find((x) => x.chave === p.get('funcao'));
      if (f) {
        const msg = this.funcoes.status()[f.chave]?.mensagem;
        this.form.set({ titulo: f.nome + ' em manutenção', texto: msg || 'Volta em breve.', tag_id: tag('Manutenção') });
      }
    }
  }

  protected novo() {
    this.form.set({});
  }

  protected editar(c: Comunicado) {
    this.form.set(c);
  }

  protected duplicar(c: Comunicado) {
    const { id, lidos, total_usuarios, publicado, push_enviado_em, criado_em, ...resto } = c;
    this.form.set({ ...resto, titulo: c.titulo + ' (cópia)', push: false });
  }

  protected fechar(recarregar: boolean) {
    this.form.set(null);
    if (recarregar) this.carregar();
  }

  protected async encerrar(c: Comunicado) {
    if (!confirm(`Encerrar "${c.titulo}" agora?`)) return;
    await this.agir(() => this.admin.salvarComunicado({ ...c, fim: new Date().toISOString() }), 'Aviso encerrado');
  }

  protected async excluir(c: Comunicado) {
    if (!confirm(`Excluir o rascunho "${c.titulo}"?`)) return;
    await this.agir(() => this.admin.excluirComunicado(c.id), 'Rascunho excluído');
  }

  protected async renomear(t: ComunicadoTag, el: HTMLInputElement) {
    const nome = el.value.trim();
    if (!nome) {
      el.value = t.nome;
      return;
    }
    await this.salvarTag({ ...t, nome });
  }

  protected async criarTag() {
    const nome = this.novaNome().trim();
    if (!nome) return;
    await this.salvarTag({ nome, cor: this.novaCor(), arquivada: false });
    this.novaNome.set('');
  }

  protected salvarTag(t: Partial<ComunicadoTag>) {
    return this.agir(() => this.admin.salvarTag(t), 'Tag salva');
  }

  private async agir(fn: () => Promise<unknown>, ok: string) {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      await fn();
      this.toast.ok(ok);
      await this.carregar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
