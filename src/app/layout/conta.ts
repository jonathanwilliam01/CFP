import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, Foto } from '../core/auth';
import { Store } from '../core/store';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { fecharNoVoltar } from '../shared/voltar';

const TAM = 220;
const MAX_LADO = 1024;

/** Minha conta: dados do usuário e foto de perfil (visualizar, trocar, enquadrar) */
@Component({
  selector: 'app-conta',
  imports: [Avatar, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [open]="open()" (openChange)="fechar()" [titulo]="editando() ? 'Foto de perfil' : 'Minha conta'">
      @if (!editando()) {
        <div class="form">
          <div class="perfil">
            <button type="button" class="foto" (click)="auth.foto() ? vendo.set(true) : editar()" [attr.aria-label]="auth.foto() ? 'Ver foto' : 'Adicionar foto'">
              <app-avatar [size]="72" />
            </button>
            <div class="dados">
              <h2>{{ auth.nome() }}</h2>
              <p class="small muted">{{ auth.user()?.email }}</p>
              <button type="button" class="btn ghost sm" (click)="editar()">
                <app-icon name="photo_camera" [size]="16" />{{ auth.foto() ? 'Editar foto' : 'Adicionar foto' }}
              </button>
            </div>
          </div>
          <div class="list">
            <div class="row">
              <span class="ico"><app-icon name="account_balance_wallet" /></span>
              <div class="grow">
                <div class="t">{{ s.carteira()?.nome }}</div>
                <div class="s">Carteira atual · {{ papel() }}</div>
              </div>
            </div>
            <div class="row">
              <span class="ico"><app-icon name="group" /></span>
              <div class="grow">
                <div class="t">{{ s.membros().length }} {{ s.membros().length === 1 ? 'membro' : 'membros' }}</div>
                <div class="s">{{ nomesMembros() }}</div>
              </div>
            </div>
            @if (desde(); as d) {
              <div class="row">
                <span class="ico"><app-icon name="event" /></span>
                <div class="grow"><div class="t">Conta criada em {{ d }}</div></div>
              </div>
            }
          </div>
          <button class="btn ghost block" type="button" (click)="irConfig()"><app-icon name="settings" [size]="18" />Configurações</button>
          <button class="btn danger block" type="button" (click)="sair()"><app-icon name="logout" [size]="18" />Sair</button>
        </div>
      } @else {
        <div class="form">
          @if (ajuste(); as a) {
            <div class="editor" (pointerdown)="iniciar($event)" (pointermove)="mover($event)" (pointerup)="soltar()"
              (pointercancel)="soltar()" (wheel)="rolar($event)">
              <app-avatar [size]="tam" [foto]="a" />
            </div>
            <label class="zoom">
              <app-icon name="zoom_out" [size]="20" />
              <input type="range" min="1" max="3" step="0.01" [value]="a.zoom" (input)="zoom(+$any($event.target).value)" aria-label="Zoom" />
              <app-icon name="zoom_in" [size]="20" />
            </label>
            <p class="small muted centro">Arraste a foto para enquadrar.</p>
          } @else {
            <button type="button" class="vazio" (click)="arq.click()">
              <app-icon name="add_a_photo" [size]="40" />Escolha uma foto
            </button>
          }
          <input #arq type="file" accept="image/*" hidden (change)="escolher($event)" />
          <button class="btn ghost block" type="button" (click)="arq.click()">
            <app-icon name="photo_library" [size]="18" />{{ ajuste() ? 'Trocar foto' : 'Escolher foto' }}
          </button>
          <button class="btn block" type="button" [disabled]="!ajuste() || salvando()" (click)="salvar()">Salvar</button>
          @if (auth.foto()) {
            <button class="btn danger block" type="button" [disabled]="salvando()" (click)="remover()">Remover foto</button>
          }
          <button class="btn ghost block" type="button" (click)="cancelar()">Voltar</button>
        </div>
      }
    </app-sheet>

    @if (vendo() && auth.foto(); as f) {
      <div class="visor" (click)="vendo.set(false)">
        <img [src]="f.url" alt="Foto de perfil" />
        <button type="button" class="btn ghost icon fechar" aria-label="Fechar"><app-icon name="close" /></button>
      </div>
    }
  `,
  styles: `
    .perfil { display: flex; align-items: center; gap: 16px; }
    .dados { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
    .dados .btn { margin-top: 4px; }
    .foto { border: 0; padding: 0; background: none; cursor: pointer; border-radius: 50%; }
    .ico { color: var(--ink-2); }
    .editor {
      align-self: center; border-radius: 50%; cursor: grab; touch-action: none;
      box-shadow: 0 0 0 4px var(--primary-soft);
    }
    .editor:active { cursor: grabbing; }
    .zoom { display: flex; align-items: center; gap: 10px; color: var(--ink-2); }
    .zoom input { flex: 1; min-height: 0; padding: 0; border: 0; background: none; box-shadow: none; accent-color: var(--primary); }
    .centro { text-align: center; }
    .vazio {
      align-self: center; width: 220px; height: 220px; border-radius: 50%; border: 2px dashed var(--line);
      background: var(--card-2); color: var(--ink-2); font: inherit; font-weight: 600; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    }
    .visor {
      position: fixed; inset: 0; z-index: 60; background: rgb(0 0 0 / 0.85);
      display: grid; place-items: center; padding: 24px; animation: fade 0.15s;
    }
    .visor img { max-width: 100%; max-height: 100%; border-radius: 16px; object-fit: contain; }
    .fechar { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); right: 12px; }
    @keyframes fade { from { opacity: 0; } }
  `,
})
export class Conta {
  protected auth = inject(Auth);
  protected s = inject(Store);
  private router = inject(Router);
  private toast = inject(Toast);

  readonly open = model(false);
  protected tam = TAM;
  protected vendo = signal(false);
  protected editando = signal(false);
  protected salvando = signal(false);
  protected ajuste = signal<Foto | null>(null);
  private imagem: Blob | null = null;
  private arraste: { x: number; y: number } | null = null;

  protected papel = computed(() => {
    const m = this.s.membros().find((x) => x.user_id === this.auth.user()?.id);
    return m?.papel === 'dono' ? 'Dono' : 'Membro';
  });
  protected nomesMembros = computed(() => this.s.membros().map((m) => m.nome).join(', '));
  protected desde = computed(() => {
    const d = this.auth.user()?.created_at;
    return d ? new Date(d).toLocaleDateString('pt-BR') : '';
  });

  constructor() {
    fecharNoVoltar(() => this.editando(), () => this.cancelar());
    fecharNoVoltar(() => this.vendo(), () => this.vendo.set(false));
  }

  editar() {
    const f = this.auth.foto();
    this.limparImagem();
    this.ajuste.set(f ? { ...f } : null);
    this.editando.set(true);
  }

  cancelar() {
    this.limparImagem();
    this.editando.set(false);
  }

  fechar() {
    this.cancelar();
    this.open.set(false);
  }

  /** Fecha e espera o histórico voltar antes de navegar, senão o voltar desfaz a navegação */
  private fecharAntes() {
    const voltou = new Promise((ok) => addEventListener('popstate', ok, { once: true }));
    this.fechar();
    return voltou;
  }

  async irConfig() {
    await this.fecharAntes();
    this.router.navigateByUrl('/config');
  }

  async escolher(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    try {
      const blob = await reduzir(arquivo);
      this.limparImagem();
      this.imagem = blob;
      this.ajuste.set({ url: URL.createObjectURL(blob), zoom: 1, x: 0, y: 0 });
    } catch {
      this.toast.erro('Não foi possível abrir esta imagem');
    }
  }

  zoom(z: number) {
    this.ajuste.update((a) => a && limitar({ ...a, zoom: z }));
  }

  iniciar(ev: PointerEvent) {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.arraste = { x: ev.clientX, y: ev.clientY };
  }

  mover(ev: PointerEvent) {
    if (!this.arraste) return;
    const dx = ((ev.clientX - this.arraste.x) / TAM) * 100;
    const dy = ((ev.clientY - this.arraste.y) / TAM) * 100;
    this.arraste = { x: ev.clientX, y: ev.clientY };
    this.ajuste.update((a) => a && limitar({ ...a, x: a.x + dx, y: a.y + dy }));
  }

  soltar() {
    this.arraste = null;
  }

  rolar(ev: WheelEvent) {
    ev.preventDefault();
    const a = this.ajuste();
    if (a) this.zoom(Math.min(3, Math.max(1, a.zoom - ev.deltaY * 0.002)));
  }

  async salvar() {
    const a = this.ajuste();
    if (!a) return;
    this.salvando.set(true);
    try {
      await this.auth.salvarFoto(this.imagem, { zoom: a.zoom, x: a.x, y: a.y });
      this.toast.ok('Foto salva');
      this.cancelar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async remover() {
    if (!confirm('Remover a foto de perfil?')) return;
    this.salvando.set(true);
    try {
      await this.auth.removerFoto();
      this.cancelar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async sair() {
    if (!confirm('Sair da conta?')) return;
    await this.fecharAntes();
    await this.auth.sair();
    this.router.navigateByUrl('/login');
  }

  private limparImagem() {
    const url = this.ajuste()?.url;
    if (this.imagem && url) URL.revokeObjectURL(url);
    this.imagem = null;
  }
}

/** Mantém a foto cobrindo o círculo: deslocamento máximo cresce com o zoom */
function limitar(a: Foto): Foto {
  const lim = (a.zoom - 1) * 50;
  const c = (v: number) => Math.round(Math.min(lim, Math.max(-lim, v)) * 100) / 100;
  return { ...a, x: c(a.x), y: c(a.y) };
}

/** Reduz para no máximo 1024px de lado, em JPEG */
async function reduzir(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k);
  cv.height = Math.round(img.height * k);
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
  img.close();
  return new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha()), 'image/jpeg', 0.85));
}
