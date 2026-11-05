import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { Admin } from '../../core/admin';
import { Comunicado, ComunicadoTag } from '../../core/models';
import { Nota } from '../../core/versao';
import { Toast } from '../../shared/toast';

export function avisoDaVersao(n: Nota): Pick<Comunicado, 'titulo' | 'texto' | 'link'> {
  const t = n.itens.slice(0, 3).join(' · ');
  return { titulo: 'Chegou a ' + n.versao, texto: t.length > 280 ? t.slice(0, 279) + '…' : t, link: '/novidades' };
}

const NOVA = '+nova';

function local(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

@Component({
  selector: 'app-aviso-form',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grade">
      <div class="c form">
        <label>Título<input type="text" maxlength="80" [value]="titulo()" (input)="titulo.set($any($event.target).value)" /></label>
        <label>Mensagem<textarea rows="4" maxlength="400" [value]="texto()" (input)="texto.set($any($event.target).value)"></textarea></label>
        <label>Tag
          <select [value]="tagId()" (change)="tagId.set($any($event.target).value)">
            <option value="">Escolha…</option>
            @for (t of visiveis(); track t.id) { <option [value]="t.id" [selected]="t.id === tagId()">{{ t.nome }}</option> }
            <option [value]="nova">+ Nova tag</option>
          </select>
        </label>
        @if (tagId() === nova) {
          <div class="nt">
            <input type="text" placeholder="Nome da tag" aria-label="Nome da tag" [value]="novaNome()" (input)="novaNome.set($any($event.target).value)" />
            <input type="color" aria-label="Cor" [value]="novaCor()" (input)="novaCor.set($any($event.target).value)" />
            <button type="button" class="btn ghost" (click)="criarTag()" [disabled]="ocupado()">Criar</button>
          </div>
        }
        <div class="dois">
          <label>Início<input type="datetime-local" [value]="inicio()" (input)="inicio.set($any($event.target).value)" /></label>
          <label>Fim<input type="datetime-local" [value]="fim()" (input)="fim.set($any($event.target).value)" /></label>
        </div>
        <label>Link (opcional, interno ou URL)<input type="text" placeholder="/novidades" [value]="link()" (input)="link.set($any($event.target).value)" /></label>
        <label class="ck"><input type="checkbox" [checked]="push()" (change)="push.set($any($event.target).checked)" />Enviar push quando entrar no ar</label>
        <label class="ck"><input type="checkbox" [checked]="destaque()" (change)="destaque.set($any($event.target).checked)" />Destaque (banner no topo até ser lido)</label>
        @if (aviso().push_enviado_em; as e) { <div class="dica">Push já enviado em {{ e | date: 'dd/MM HH:mm' }} — não será reenviado</div> }
        @if (erro()) { <div class="erro" role="alert">{{ erro() }}</div> }
        <div class="bts">
          <button type="button" class="btn ghost" (click)="cancelar.emit()" [disabled]="ocupado()">Cancelar</button>
          <button type="button" class="btn ghost" (click)="salvar(false)" [disabled]="ocupado()">Salvar rascunho</button>
          <button type="button" class="btn" (click)="salvar(true)" [disabled]="ocupado()">{{ agendado() ? 'Agendar' : 'Publicar' }}</button>
        </div>
      </div>
      <div class="c">
        <div class="pv">Pré-visualização</div>
        <div class="card com">
          @if (tag(); as t) { <span class="tag" [style.color]="t.cor" [style.background]="'color-mix(in srgb, ' + t.cor + ' 15%, transparent)'">{{ t.nome }}</span> }
          <div class="t">{{ titulo() || 'Título do aviso' }}</div>
          <div class="small muted">{{ hoje | date: 'dd/MM' }}</div>
          <div class="s">{{ texto() || 'A mensagem aparece aqui.' }}</div>
          @if (link().trim()) { <span class="small lk">Abrir</span> }
        </div>
      </div>
    </div>
  `,
  styles: `
    .grade { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .c { background: var(--card); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }
    .form { display: flex; flex-direction: column; gap: 12px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-3); }
    label.ck { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; color: var(--ink); }
    .dois { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .nt { display: flex; gap: 8px; align-items: center; }
    .nt input[type='text'] { flex: 1; }
    .dica { font-size: 12px; color: var(--ink-3); }
    .erro { background: var(--danger-soft); color: var(--danger); padding: 8px 10px; border-radius: 10px; font-size: 13px; }
    .bts { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .pv { font-size: 12px; color: var(--ink-3); margin-bottom: 8px; }
    .com { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .com .s { color: var(--ink-2); font-size: 0.9rem; white-space: pre-line; }
    .tag { font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
    .lk { color: var(--primary); font-weight: 700; }
    @media (max-width: 800px) { .grade { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 640px) { .dois { grid-template-columns: minmax(0, 1fr); } .bts .btn { flex: 1; } }
  `,
})
export class AvisoForm implements OnInit {
  private admin = inject(Admin);
  private toast = inject(Toast);
  readonly aviso = input.required<Partial<Comunicado>>();
  readonly tags = input.required<ComunicadoTag[]>();
  readonly salvo = output<void>();
  readonly cancelar = output<void>();
  readonly tagCriada = output<void>();

  protected nova = NOVA;
  protected hoje = new Date();
  protected titulo = signal('');
  protected texto = signal('');
  protected tagId = signal('');
  protected inicio = signal('');
  protected fim = signal('');
  protected link = signal('');
  protected push = signal(false);
  protected destaque = signal(false);
  protected novaNome = signal('');
  protected novaCor = signal('#1d5bd8');
  protected erro = signal('');
  protected ocupado = signal(false);

  protected visiveis = computed(() => this.tags().filter((t) => !t.arquivada || t.id === this.tagId()));
  protected tag = computed(() => this.tags().find((t) => t.id === this.tagId()) ?? null);
  protected agendado = computed(() => !!this.inicio() && new Date(this.inicio()).getTime() > Date.now());

  ngOnInit() {
    const a = this.aviso();
    const agora = new Date();
    this.titulo.set(a.titulo ?? '');
    this.texto.set(a.texto ?? '');
    this.tagId.set(a.tag_id ?? '');
    this.inicio.set(local(a.inicio ?? agora.toISOString()));
    this.fim.set(local(a.fim ?? new Date(agora.getTime() + 7 * 864e5).toISOString()));
    this.link.set(a.link ?? '');
    this.push.set(a.push ?? false);
    this.destaque.set(a.destaque ?? false);
  }

  protected async criarTag() {
    const nome = this.novaNome().trim();
    if (!nome) {
      this.erro.set('Informe o nome da tag.');
      return;
    }
    const id = crypto.randomUUID();
    this.ocupado.set(true);
    try {
      await this.admin.salvarTag({ id, nome, cor: this.novaCor(), arquivada: false });
      this.tagCriada.emit();
      this.tagId.set(id);
      this.novaNome.set('');
      this.erro.set('');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async salvar(publicado: boolean) {
    const ini = new Date(this.inicio());
    const fim = new Date(this.fim());
    const t = this.titulo().trim();
    const x = this.texto().trim();
    const tagOk = this.tagId() && this.tagId() !== NOVA;
    const e = !t || !x ? 'Título e mensagem são obrigatórios.'
      : !tagOk ? 'Escolha uma tag.'
      : !this.inicio() || !this.fim() || isNaN(+ini) || isNaN(+fim) ? 'Informe início e fim.'
      : fim <= ini ? 'O fim precisa ser depois do início.'
      : '';
    this.erro.set(e);
    if (e) return;
    this.ocupado.set(true);
    try {
      await this.admin.salvarComunicado({
        id: this.aviso().id,
        titulo: t,
        texto: x,
        tag_id: this.tagId(),
        inicio: ini.toISOString(),
        fim: fim.toISOString(),
        link: this.link().trim() || null,
        push: this.push(),
        destaque: this.destaque(),
        publicado,
      });
      this.toast.ok(publicado ? (this.agendado() ? 'Aviso agendado' : 'Aviso publicado') : 'Rascunho salvo');
      this.salvo.emit();
    } catch (err) {
      this.toast.erro(err);
    } finally {
      this.ocupado.set(false);
    }
  }
}
