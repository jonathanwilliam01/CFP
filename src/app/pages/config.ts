import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Insights } from '../core/insights';
import { Categoria, Membro } from '../core/models';
import { Painel } from '../core/painel';
import { Push } from '../core/push';
import { Store } from '../core/store';
import { CORES, Cor, Tema } from '../core/tema';
import { q, supabase } from '../core/supabase';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { IconePicker } from '../shared/icone-picker';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { Visor } from '../shared/visor';

@Component({
  imports: [FormsModule, Avatar, Icon, IconePicker, Sheet, Visor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Configurações</h1></div>

      <form class="card form" (ngSubmit)="salvarNome()">
        <h2>Perfil</h2>
        <p class="small muted">{{ auth.user()?.email }}</p>
        <label class="field"><span>Seu nome</span><input name="nome" [(ngModel)]="nome" /></label>
        <button class="btn ghost" [disabled]="ocupado()">Salvar nome</button>
      </form>

      @if (s.carteira(); as c) {
        <div class="card form">
          <h2>Carteira compartilhada</h2>
          <label class="field"><span>Nome da carteira</span>
            <div class="linha">
              <input name="carteira" [(ngModel)]="nomeCarteira" />
              <button class="btn ghost" type="button" (click)="renomear()" [disabled]="ocupado()">Salvar</button>
            </div>
          </label>
          <div class="convite">
            <div>
              <span class="small muted">Código de convite</span>
              <div class="cod">{{ c.codigo }}</div>
            </div>
            <button class="btn" type="button" (click)="compartilhar(c.codigo)"><app-icon name="share" [size]="18" />Convidar</button>
          </div>
          <p class="small muted">Quem entrar com este código lança e vê tudo desta carteira.</p>
          @if (s.souDono()) {
            <button class="btn ghost" type="button" (click)="novoCodigo()" [disabled]="ocupado()"><app-icon name="autorenew" [size]="18" />Gerar novo código</button>
          }

          <h3>Membros</h3>
          <div class="list">
            @for (m of s.membros(); track m.user_id) {
              <div class="row">
                <button type="button" class="foto" [disabled]="!m.foto" (click)="foto.set(m.foto?.url ?? null)" [attr.aria-label]="'Ver foto de ' + m.nome">
                  <app-avatar [size]="40" [foto]="m.foto ?? null" [nome]="m.nome" />
                </button>
                <div class="grow">
                  <div class="t">{{ m.nome }}{{ m.user_id === auth.user()?.id ? ' (você)' : '' }}</div>
                  <div class="s">{{ m.papel === 'dono' ? 'Dono' : 'Membro' }}</div>
                </div>
                @if (s.souDono() && m.user_id !== auth.user()?.id) {
                  <button class="btn ghost icon" type="button" (click)="removerMembro(m)" [disabled]="ocupado()" [attr.aria-label]="'Remover ' + m.nome">
                    <app-icon name="person_remove" [size]="18" />
                  </button>
                }
              </div>
            }
          </div>
          <div class="linha">
            <button class="btn ghost danger-ink" type="button" (click)="sairCarteira()" [disabled]="ocupado()"><app-icon name="logout" [size]="18" />Sair da carteira</button>
            @if (s.souDono()) {
              <button class="btn danger" type="button" (click)="sairCarteira(true)" [disabled]="ocupado()"><app-icon name="delete" [size]="18" />Excluir carteira</button>
            }
          </div>
        </div>
      }

      <div class="card">
        <div class="card-head">
          <h2>Categorias</h2>
          <button class="btn sm" type="button" (click)="novaCategoria()"><app-icon name="add" [size]="16" />Nova</button>
        </div>
        <div class="seg">
          <button type="button" [class.on]="tipoCat() === 'gasto'" (click)="tipoCat.set('gasto')">Gastos</button>
          <button type="button" [class.on]="tipoCat() === 'entrada'" (click)="tipoCat.set('entrada')">Entradas</button>
        </div>
        <div class="list">
          @for (c of cats(); track c.id) {
            <button class="row" type="button" (click)="editarCategoria(c)">
              <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
              <div class="grow"><div class="t">{{ c.nome }}</div></div>
              <i class="cor" [style.background]="c.cor"></i>
            </button>
          }
        </div>
      </div>

      <div class="card form">
        <h2>Carteiras</h2>
        <div class="list">
          @for (c of s.carteiras(); track c.id) {
            <button class="row" type="button" (click)="trocar(c.id)">
              <span class="ico"><app-icon name="account_balance_wallet" /></span>
              <div class="grow"><div class="t">{{ c.nome }}</div></div>
              @if (c.id === s.carteiraId()) {
                <span class="badge ok"><app-icon name="check" [size]="12" />Atual</span>
              }
            </button>
          }
        </div>
        <label class="field"><span>Criar nova carteira</span>
          <div class="linha">
            <input name="novaCarteira" [(ngModel)]="novaCarteira" placeholder="Nome" />
            <button class="btn ghost" type="button" (click)="criarCarteira()" [disabled]="ocupado()">Criar</button>
          </div>
        </label>
        <label class="field"><span>Entrar com código</span>
          <div class="linha">
            <input name="codigo" [(ngModel)]="codigo" placeholder="ABCD2345" maxlength="8" class="up" />
            <button class="btn ghost" type="button" (click)="entrarCarteira()" [disabled]="ocupado()">Entrar</button>
          </div>
        </label>
      </div>

      <div class="card form">
        <h2>Aparência</h2>
        <div class="seg">
          <button type="button" [class.on]="tema.modo() === 'auto'" (click)="tema.modo.set('auto')"><app-icon name="contrast" [size]="18" />Automático</button>
          <button type="button" [class.on]="tema.modo() === 'claro'" (click)="tema.modo.set('claro')"><app-icon name="light_mode" [size]="18" />Claro</button>
          <button type="button" [class.on]="tema.modo() === 'escuro'" (click)="tema.modo.set('escuro')"><app-icon name="dark_mode" [size]="18" />Escuro</button>
        </div>
        <p class="small muted">Automático segue o tema do celular.</p>
        <div class="field">
          <span>Cor principal</span>
          <div class="cores">
            @for (c of cores; track c.id) {
              <button type="button" [class.on]="tema.cor() === c.id" [style.--c]="c.hex" (click)="tema.cor.set(c.id)" [attr.aria-label]="c.nome" [title]="c.nome">
                @if (tema.cor() === c.id) { <app-icon name="check" [size]="18" /> }
              </button>
            }
          </div>
        </div>
      </div>

      <div class="card form">
        <div class="card-head"><h2>Ordem do Início</h2><button class="btn ghost sm" type="button" (click)="painel.restaurar()">Padrão</button></div>
        <div class="blocos">
          @for (b of painel.lista(); track b.id; let i = $index, ult = $last) {
            <div class="bl">
              <span>{{ b.nome }}</span>
              <button type="button" class="mv" (click)="painel.mover(i, -1)" [disabled]="i === 0" aria-label="Subir"><app-icon name="arrow_upward" [size]="18" /></button>
              <button type="button" class="mv" (click)="painel.mover(i, 1)" [disabled]="ult" aria-label="Descer"><app-icon name="arrow_downward" [size]="18" /></button>
            </div>
          }
        </div>
      </div>

      <div class="card form">
        <h2>Notificações</h2>
        @switch (insights.permissao()) {
          @case ('granted') { <p class="small tit"><app-icon name="check_circle" [size]="18" />Notificações do navegador ativas.</p> }
          @case ('denied') { <p class="small muted">Bloqueadas no navegador. Libere nas configurações do site para receber avisos.</p> }
          @default {
            <p class="small muted">Receba avisos de contas vencendo e orçamentos estourados.</p>
            <button class="btn ghost" type="button" (click)="insights.pedirPermissao()"><app-icon name="notifications" [size]="18" />Ativar notificações</button>
          }
        }
        @if (push.disponivel && insights.permissao() !== 'denied') {
          <label class="check">
            <input type="checkbox" [checked]="push.ativo()" (change)="alternarPush()" [disabled]="ocupado()" />
            Avisos com o app fechado (chat e contas vencendo)
          </label>
        }
      </div>

      <button class="btn danger block" type="button" (click)="sair()"><app-icon name="logout" [size]="18" />Sair</button>
    </div>

    <app-sheet [(open)]="catAberta" [titulo]="cat.id ? 'Editar categoria' : 'Nova categoria'">
      <form class="form" (ngSubmit)="salvarCategoria()">
        <div class="seg">
          <button type="button" [class.on]="cat.tipo === 'gasto'" (click)="cat.tipo = 'gasto'">Gasto</button>
          <button type="button" [class.on]="cat.tipo === 'entrada'" (click)="cat.tipo = 'entrada'">Entrada</button>
        </div>
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="cat.nome" /></label>
        <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="cat.cor" /></label>
        <div class="field"><span>Ícone</span><app-icone-picker [(valor)]="cat.icone" [cor]="cat.cor" /></div>
        <label class="field"><span>Ordem</span><input name="ordem" type="number" inputmode="numeric" [(ngModel)]="cat.ordem" /></label>
        <button class="btn block" [disabled]="ocupado()">Salvar</button>
        @if (cat.id) {
          <button class="btn danger block" type="button" (click)="excluirCategoria()">Excluir categoria</button>
        }
      </form>
    </app-sheet>

    <app-visor [(url)]="foto" />
  `,
  styles: `
    .linha { display: flex; gap: 8px; }
    .cores { display: flex; gap: 10px; flex-wrap: wrap; }
    .cores button {
      width: 38px; height: 38px; border-radius: 50%; border: 3px solid var(--card); background: var(--c); color: #fff;
      box-shadow: 0 0 0 1px var(--line); cursor: pointer; display: grid; place-items: center;
    }
    .cores button.on { box-shadow: 0 0 0 2px var(--c); }
    .foto { border: 0; padding: 0; background: none; border-radius: 50%; cursor: pointer; }
    .foto:disabled { cursor: default; }
    .linha input { flex: 1; min-width: 0; }
    .convite { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--primary-soft); border-radius: 14px; padding: 12px; }
    .cod { font-size: 1.5rem; font-weight: 800; letter-spacing: 0.2em; color: var(--primary); }
    .cor { width: 14px; height: 14px; border-radius: 50%; }
    .up { text-transform: uppercase; letter-spacing: 0.15em; }
    .seg { margin-bottom: 6px; }
    .linha .btn { flex: 1; }
    .danger-ink { color: var(--danger); }
    .blocos { display: flex; flex-direction: column; }
    .bl { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
    .bl:last-child { border-bottom: 0; }
    .bl span { flex: 1; }
    .mv { border: 0; background: none; color: var(--ink-2); cursor: pointer; padding: 6px; border-radius: 8px; display: grid; }
    .mv:disabled { opacity: 0.3; cursor: default; }
  `,
})
export default class Config {
  protected auth = inject(Auth);
  protected s = inject(Store);
  protected insights = inject(Insights);
  protected tema = inject(Tema);
  protected painel = inject(Painel);
  protected cores = (Object.keys(CORES) as Cor[]).map((id) => ({ id, hex: CORES[id], nome: id[0].toUpperCase() + id.slice(1) }));
  protected push = inject(Push);
  private toast = inject(Toast);
  private router = inject(Router);

  protected ocupado = signal(false);
  protected foto = signal<string | null>(null);
  protected catAberta = signal(false);
  protected tipoCat = signal<'gasto' | 'entrada'>('gasto');
  protected cats = computed(() => this.s.categorias().filter((c) => c.tipo === this.tipoCat()));

  nome = this.auth.nome();
  nomeCarteira = this.s.carteira()?.nome ?? '';
  novaCarteira = '';
  codigo = '';
  cat = { id: '', nome: '', icone: 'sell', cor: '#64748b', tipo: 'gasto' as 'gasto' | 'entrada', ordem: 50 };

  private async exec(f: () => Promise<unknown>, ok: string) {
    this.ocupado.set(true);
    try {
      await f();
      this.toast.ok(ok);
      return true;
    } catch (e) {
      this.toast.erro(e);
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  salvarNome() {
    const nome = this.nome.trim();
    if (!nome) return this.toast.erro('Informe o nome');
    return this.exec(async () => {
      const { error } = await supabase.auth.updateUser({ data: { nome } });
      if (error) throw new Error(error.message);
      await q(supabase.from('carteira_membros').update({ nome }).eq('user_id', this.auth.user()!.id));
      await this.s.carregarTudo();
    }, 'Nome atualizado');
  }

  renomear() {
    const nome = this.nomeCarteira.trim();
    if (!nome) return this.toast.erro('Informe o nome');
    return this.exec(async () => {
      await q(supabase.from('carteiras').update({ nome }).eq('id', this.s.carteiraId()!));
      await this.s.iniciar();
    }, 'Carteira renomeada');
  }

  async compartilhar(codigo: string) {
    const texto = `Entre na nossa carteira no CFP com o código ${codigo}: ${location.origin}`;
    try {
      if (navigator.share) await navigator.share({ title: 'CFP', text: texto });
      else {
        await navigator.clipboard.writeText(texto);
        this.toast.ok('Convite copiado');
      }
    } catch {
      // compartilhamento cancelado
    }
  }

  novaCategoria() {
    this.cat = { id: '', nome: '', icone: 'sell', cor: '#64748b', tipo: this.tipoCat(), ordem: 50 };
    this.catAberta.set(true);
  }

  editarCategoria(c: Categoria) {
    this.cat = { id: c.id, nome: c.nome, icone: c.icone, cor: c.cor, tipo: c.tipo, ordem: c.ordem };
    this.catAberta.set(true);
  }

  async salvarCategoria() {
    if (!this.cat.nome.trim()) return this.toast.erro('Informe o nome');
    const { id, ...dados } = this.cat;
    const ok = await this.exec(
      () => this.s.salvar('categorias', { id: id || undefined, ...dados, nome: dados.nome.trim(), icone: dados.icone || 'sell', ordem: +dados.ordem || 0 }),
      'Categoria salva',
    );
    if (ok) this.catAberta.set(false);
  }

  excluirCategoria() {
    this.s.excluirAdiado('categorias', this.cat.id, 'Categoria excluída');
    this.catAberta.set(false);
  }

  trocar(id: string) {
    if (id === this.s.carteiraId()) return;
    this.s.carteiraId.set(id);
    this.nomeCarteira = this.s.carteira()?.nome ?? '';
    this.toast.ok(`Carteira: ${this.s.carteira()?.nome}`);
  }

  async criarCarteira() {
    const nome = this.novaCarteira.trim();
    if (!nome) return this.toast.erro('Informe o nome');
    if (await this.exec(() => this.s.criarCarteira(nome), 'Carteira criada')) {
      this.novaCarteira = '';
      this.nomeCarteira = nome;
    }
  }

  async entrarCarteira() {
    if (!this.codigo.trim()) return this.toast.erro('Informe o código');
    if (await this.exec(() => this.s.entrarCarteira(this.codigo), 'Você entrou na carteira')) {
      this.codigo = '';
      this.nomeCarteira = this.s.carteira()?.nome ?? '';
    }
  }

  novoCodigo() {
    if (!confirm('Gerar um novo código? O atual deixa de funcionar.')) return;
    return this.exec(() => this.s.novoCodigo(), 'Novo código gerado');
  }

  removerMembro(m: Membro) {
    if (!confirm(`Remover ${m.nome} da carteira?`)) return;
    return this.exec(() => this.s.removerMembro(m.user_id), 'Membro removido');
  }

  async sairCarteira(excluir = false) {
    const nome = this.s.carteira()?.nome;
    const sozinho = this.s.membros().length === 1;
    const msg = excluir
      ? `Excluir a carteira "${nome}" com todos os lançamentos? Não dá para desfazer.`
      : `Sair da carteira "${nome}"?` + (sozinho ? ' Você é o único membro: ela será apagada.' : '');
    if (!confirm(msg)) return;
    let resta = true;
    const ok = await this.exec(async () => {
      resta = await this.s.sairCarteira(excluir);
    }, excluir ? 'Carteira excluída' : 'Você saiu da carteira');
    if (!ok) return;
    if (!resta) this.router.navigateByUrl('/bem-vindo');
    else this.nomeCarteira = this.s.carteira()?.nome ?? '';
  }

  alternarPush() {
    const ativo = this.push.ativo();
    return this.exec(() => (ativo ? this.push.desativar() : this.push.ativar()), ativo ? 'Avisos desligados' : 'Avisos ligados');
  }

  async sair() {
    if (!confirm('Sair da conta?')) return;
    await this.auth.sair();
    this.router.navigateByUrl('/login');
  }
}
