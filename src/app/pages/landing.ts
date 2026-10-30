import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../shared/icon';

const CONTATO = 'jonathanwillianps01@gmail.com';

/** Apresentação para quem ainda não entrou; sempre no tema escuro azul */
@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tema-escuro' },
  template: `
    <header class="topo" [class.rolou]="rolou()">
      <div class="barra">
        <button type="button" class="marca" (click)="ir('topo')"><span class="logo">CFP</span><span class="nome">Controle Financeiro Pessoal</span></button>
        <nav class="links" [class.aberto]="menu()">
          @for (s of secoes; track s.id) {
            <button type="button" (click)="ir(s.id)">{{ s.nome }}</button>
          }
          <a routerLink="/login" class="btn ghost sm so-menu">Entrar</a>
        </nav>
        <div class="acoes">
          <a routerLink="/login" class="btn ghost sm entrar">Entrar</a>
          <a routerLink="/login" [queryParams]="{ criar: 1 }" class="btn sm">Criar conta</a>
          <button type="button" class="hamb" (click)="menu.set(!menu())" [attr.aria-expanded]="menu()" aria-label="Menu">
            <app-icon [name]="menu() ? 'close' : 'menu'" />
          </button>
        </div>
      </div>
    </header>

    <main id="topo">
      <div class="brilho b1" aria-hidden="true"></div>
      <div class="brilho b2" aria-hidden="true"></div>

      <section class="hero">
        <div class="texto">
          <span class="selo entra" style="--d: 0ms"><app-icon name="bolt" [size]="16" [fill]="true" />Grátis · funciona no celular</span>
          <h1 class="entra" style="--d: 80ms">O dinheiro da casa, <em>num lugar só.</em></h1>
          <p class="lead entra" style="--d: 160ms">Lance um gasto em segundos, acompanhe contas e faturas do mês e saiba quanto sobra antes do salário cair.</p>
          <div class="ctas entra" style="--d: 240ms">
            <a routerLink="/login" [queryParams]="{ criar: 1 }" class="btn grande">Criar conta grátis<app-icon name="arrow_forward" [size]="20" /></a>
            <button type="button" class="btn ghost grande" (click)="ir('funcoes')">Ver funções</button>
          </div>
          <p class="nota entra" style="--d: 320ms"><app-icon name="install_mobile" [size]="18" />Abre no navegador e pode ser instalado como app.</p>
        </div>

        <div class="palco entra" style="--d: 200ms" aria-hidden="true">
          <div class="tela">
            <div class="saldo">
              <small>Saldo previsto do mês</small>
              <strong>R$ 2.184,90</strong>
              <div class="es">
                <span><i>↑ Entradas</i><b class="sobe">R$ 7.450,00</b></span>
                <span><i>↓ Saídas</i><b class="desce">R$ 5.265,10</b></span>
              </div>
              <svg viewBox="0 0 200 50" preserveAspectRatio="none"><path pathLength="1" d="M0,40 L18,38 L30,12 L55,16 L80,22 L100,30 L120,28 L140,34 L165,36 L200,20" /></svg>
            </div>
            <div class="item"><span class="ico c1"><app-icon name="shopping_cart" [size]="20" /></span><span class="t">Mercado<small>Hoje · Nubank</small></span><b>R$ 312,40</b></div>
            <div class="item"><span class="ico c2"><app-icon name="bolt" [size]="20" /></span><span class="t">Luz<small>Vence em 2 dias</small></span><span class="badge alerta">2d</span></div>
            <div class="item"><span class="ico c3"><app-icon name="savings" [size]="20" /></span><span class="t">Viagem<small>Meta 68%</small></span><span class="mini"><i></i></span></div>
          </div>
          <div class="flutua f1"><app-icon name="credit_card" [size]="18" />Fatura fecha em 3 dias</div>
          <div class="flutua f2"><app-icon name="check_circle" [size]="18" />Internet paga</div>
        </div>
      </section>

      <section id="funcoes" class="secao">
        <span class="kicker rv">Funções</span>
        <h2 class="rv">Tudo o que o mês pede</h2>
        <div class="grade">
          @for (r of recursos; track r.titulo; let i = $index) {
            <article class="rv" [style.--d]="(i % 3) * 90 + 'ms'">
              <span class="ri"><app-icon [name]="r.icone" [size]="24" /></span>
              <h3>{{ r.titulo }}</h3>
              <p>{{ r.texto }}</p>
            </article>
          }
        </div>
      </section>

      <section id="como" class="secao">
        <span class="kicker rv">Como funciona</span>
        <h2 class="rv">Comece em três passos</h2>
        <ol>
          @for (p of passos; track p.titulo; let i = $index) {
            <li class="rv" [style.--d]="i * 120 + 'ms'"><b>{{ p.titulo }}</b><span>{{ p.texto }}</span></li>
          }
        </ol>
      </section>

      <section id="duvidas" class="secao">
        <span class="kicker rv">Dúvidas</span>
        <h2 class="rv">Perguntas frequentes</h2>
        <div class="faq">
          @for (d of duvidas; track d.p) {
            <details class="rv">
              <summary>{{ d.p }}<app-icon name="expand_more" [size]="20" /></summary>
              <p>{{ d.r }}</p>
            </details>
          }
        </div>
      </section>

      <section id="contato" class="secao contato rv">
        <span class="ri grande-ico"><app-icon name="mail" [size]="28" /></span>
        <div>
          <h2>Fale com a gente</h2>
          <p>Sugestão, dúvida ou problema? Mande um e-mail que a resposta vem rápido.</p>
        </div>
        <a class="btn grande" [href]="'mailto:' + contato + '?subject=CFP'"><app-icon name="send" [size]="20" />{{ contato }}</a>
      </section>

      <section class="final rv">
        <h2>Comece hoje e feche o mês sem susto.</h2>
        <div class="ctas">
          <a routerLink="/login" [queryParams]="{ criar: 1 }" class="btn grande">Criar conta</a>
          <a routerLink="/login" class="btn ghost grande">Entrar</a>
        </div>
      </section>
    </main>

    <footer>
      <span>© {{ ano }} CFP · Controle Financeiro Pessoal</span>
      <a [href]="'mailto:' + contato">{{ contato }}</a>
    </footer>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--bg); color: var(--ink); overflow-x: clip; }

    .topo {
      position: sticky; top: 0; z-index: 10; padding-top: env(safe-area-inset-top, 0px);
      transition: background 0.25s, border-color 0.25s; border-bottom: 1px solid transparent;
    }
    .topo.rolou { background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(14px); border-color: var(--line); }
    .barra { max-width: 1120px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; gap: 16px; }
    .marca { display: flex; align-items: center; gap: 10px; font: inherit; font-weight: 800; color: var(--ink); background: none; border: 0; cursor: pointer; padding: 0; }
    .logo { background: var(--primary); color: var(--primary-ink); border-radius: 10px; padding: 6px 9px; letter-spacing: 0.04em; }
    .nome { display: none; }
    .links { display: none; }
    .links button { font: inherit; font-weight: 600; font-size: 0.92rem; color: var(--ink-2); background: none; border: 0; cursor: pointer; padding: 8px 10px; border-radius: 10px; }
    .links button:hover { color: var(--ink); background: var(--card); }
    .links.aberto {
      display: flex; flex-direction: column; align-items: stretch; position: absolute; top: 100%; left: 12px; right: 12px; padding: 8px;
      background: var(--card); border: 1px solid var(--line); border-radius: 16px; animation: cai 0.2s ease-out;
    }
    .links.aberto button { text-align: left; padding: 12px; }
    .so-menu { margin-top: 4px; }
    .acoes { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .entrar { display: none; }
    .hamb { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }

    main { position: relative; max-width: 1120px; margin: 0 auto; padding: 8px 16px 48px; display: flex; flex-direction: column; gap: 88px; }
    .brilho { position: absolute; z-index: -1; border-radius: 50%; filter: blur(80px); opacity: 0.45; pointer-events: none; animation: deriva 14s ease-in-out infinite alternate; }
    .b1 { width: 420px; height: 420px; background: #1d5bd8; top: -120px; right: -120px; }
    .b2 { width: 320px; height: 320px; background: #0b7f9c; top: 380px; left: -160px; animation-delay: -6s; }

    .hero { display: grid; gap: 40px; align-items: center; padding-top: 24px; }
    .selo {
      display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: var(--primary);
      background: var(--primary-soft); padding: 5px 12px; border-radius: 999px;
    }
    h1 { font-size: clamp(2.2rem, 7vw, 3.8rem); line-height: 1.04; letter-spacing: -0.035em; margin: 16px 0 14px; }
    h1 em {
      font-style: normal; background: linear-gradient(90deg, var(--primary), #4cc3dd, var(--primary)); background-size: 200% auto;
      -webkit-background-clip: text; background-clip: text; color: transparent; animation: brilha 6s linear infinite;
    }
    .lead { font-size: 1.1rem; color: var(--ink-2); max-width: 36ch; }
    .ctas { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
    .grande { min-height: 52px; padding: 14px 22px; font-size: 1rem; border-radius: 14px; }
    .btn { transition: transform 0.15s, box-shadow 0.2s; }
    .btn:hover { transform: translateY(-2px); }
    .nota { display: flex; align-items: center; gap: 6px; margin-top: 16px; font-size: 0.85rem; color: var(--ink-3); }

    .palco { position: relative; justify-self: center; width: min(100%, 360px); }
    .tela {
      padding: 14px; border-radius: 28px; display: flex; flex-direction: column; gap: 10px;
      background: var(--card); border: 1px solid var(--line); box-shadow: 0 40px 80px -30px rgb(29 91 216 / 0.55);
      animation: boia 6s ease-in-out infinite;
    }
    .saldo { background: linear-gradient(145deg, #1d5bd8, #0f2f7a); color: #fff; border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
    .saldo small { opacity: 0.8; font-weight: 600; font-size: 0.75rem; }
    .saldo strong { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.03em; }
    .es { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .es span { background: rgb(255 255 255 / 0.12); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; }
    .es i { font-style: normal; font-size: 0.7rem; opacity: 0.85; font-weight: 600; }
    .es b { font-size: 0.9rem; }
    .sobe { color: #4ade80; }
    .desce { color: #ff9a94; }
    .saldo svg { width: 100%; height: 44px; margin-top: 6px; }
    .saldo path {
      fill: none; stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; opacity: 0.9;
      stroke-dasharray: 1; stroke-dashoffset: 1; animation: traca 1.6s 0.6s ease-out forwards;
    }
    .item { display: flex; align-items: center; gap: 10px; padding: 6px 4px; }
    .item .t { flex: 1; display: flex; flex-direction: column; font-weight: 700; font-size: 0.9rem; }
    .item small { font-weight: 500; color: var(--ink-2); font-size: 0.75rem; }
    .item b { font-variant-numeric: tabular-nums; font-size: 0.9rem; }
    .ico { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; }
    .c1 { background: #10b98122; color: #34d399; }
    .c2 { background: #f59e0b22; color: #fbbf24; }
    .c3 { background: #8b5cf622; color: #a78bfa; }
    .mini { width: 64px; height: 6px; border-radius: 999px; background: var(--card-2); overflow: hidden; }
    .mini i { display: block; height: 100%; background: #a78bfa; animation: enche 1.4s 0.8s ease-out both; }
    .flutua {
      position: absolute; display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 14px; font-size: 0.8rem; font-weight: 700;
      background: var(--card-2); border: 1px solid var(--line); box-shadow: 0 16px 30px -12px rgb(0 0 0 / 0.6); white-space: nowrap;
    }
    .f1 { top: -16px; right: 18px; color: var(--warn); animation: boia 5s -1s ease-in-out infinite; }
    .f2 { bottom: -16px; left: 18px; color: var(--ok); animation: boia 5.5s -3s ease-in-out infinite; }

    .secao { scroll-margin-top: 80px; }
    .kicker { display: block; font-size: 0.8rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin-bottom: 8px; }
    h2 { font-size: clamp(1.5rem, 4vw, 2.1rem); letter-spacing: -0.02em; margin: 0 0 22px; }
    .grade { display: grid; gap: 12px; }
    article {
      background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 6px;
      transition: transform 0.25s, border-color 0.25s, opacity 0.6s var(--d, 0ms), translate 0.6s var(--d, 0ms);
    }
    article:hover { transform: translateY(-4px); border-color: var(--primary); }
    .ri { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); margin-bottom: 4px; flex: none; }
    article h3 { margin: 0; }
    article p { color: var(--ink-2); font-size: 0.92rem; margin: 0; }

    ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; counter-reset: p; }
    li {
      counter-increment: p; display: grid; grid-template-columns: 48px 1fr; column-gap: 14px; align-items: center;
      background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px;
    }
    li::before {
      content: counter(p); grid-row: span 2; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
      background: var(--primary); color: var(--primary-ink); font-weight: 800; font-size: 1.1rem;
    }
    li span { color: var(--ink-2); font-size: 0.92rem; }

    .faq { display: flex; flex-direction: column; gap: 10px; }
    details { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 0 18px; }
    summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 0; font-weight: 700; cursor: pointer; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary app-icon { transition: transform 0.2s; color: var(--ink-3); }
    details[open] summary app-icon { transform: rotate(180deg); }
    details p { margin: 0 0 16px; color: var(--ink-2); font-size: 0.94rem; }
    details[open] p { animation: cai 0.25s ease-out; }

    .contato {
      display: flex; flex-direction: column; align-items: flex-start; gap: 18px; padding: 28px 22px; border-radius: 24px;
      background: linear-gradient(145deg, var(--card), var(--card-2)); border: 1px solid var(--line);
    }
    .contato h2 { margin-bottom: 6px; }
    .contato p { margin: 0; color: var(--ink-2); }
    .contato .btn { overflow-wrap: anywhere; }
    .grande-ico { width: 56px; height: 56px; border-radius: 18px; }

    .final { text-align: center; background: linear-gradient(145deg, #1d5bd8, #0f2f7a); color: #fff; border-radius: 26px; padding: 44px 20px; }
    .final h2 { margin: 0 auto; max-width: 22ch; }
    .final .ctas { justify-content: center; }
    .final .btn:not(.ghost) { background: #fff; color: #0f2f7a; }
    .final .ghost { background: rgb(255 255 255 / 0.12); color: #fff; border-color: rgb(255 255 255 / 0.25); }

    footer {
      max-width: 1120px; margin: 0 auto; padding: 20px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
      display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 0.85rem; color: var(--ink-3); border-top: 1px solid var(--line);
    }
    footer a { color: var(--ink-2); }

    /* entrada no carregamento e ao rolar a página */
    .entra { animation: sobe 0.7s var(--d, 0ms) cubic-bezier(0.2, 0.7, 0.2, 1) both; }
    .rv { opacity: 0; translate: 0 24px; transition: opacity 0.6s var(--d, 0ms), translate 0.6s var(--d, 0ms) cubic-bezier(0.2, 0.7, 0.2, 1); }
    .rv.visto { opacity: 1; translate: 0 0; }

    @keyframes sobe { from { opacity: 0; transform: translateY(24px); } }
    @keyframes cai { from { opacity: 0; transform: translateY(-6px); } }
    @keyframes boia { 50% { transform: translateY(-10px); } }
    @keyframes deriva { to { transform: translate(60px, 40px) scale(1.15); } }
    @keyframes brilha { to { background-position: 200% center; } }
    @keyframes traca { to { stroke-dashoffset: 0; } }
    @keyframes enche { from { width: 0; } to { width: 68%; } }

    @media (prefers-reduced-motion: reduce) {
      *, .rv { animation: none !important; transition: none !important; }
      .rv { opacity: 1; translate: none; }
      .saldo path { stroke-dashoffset: 0; }
      .mini i { width: 68%; }
    }

    @media (min-width: 720px) {
      .nome, .entrar { display: inline-flex; }
      .grade { grid-template-columns: repeat(3, 1fr); }
      ol { grid-template-columns: repeat(3, 1fr); }
      li { grid-template-columns: 1fr; row-gap: 6px; }
      li::before { grid-row: auto; margin-bottom: 6px; }
      .contato { flex-direction: row; align-items: center; }
      .contato .btn { margin-left: auto; }
      .f1 { right: -24px; }
      .f2 { left: -24px; }
    }
    @media (min-width: 960px) {
      .links { display: flex; gap: 2px; margin-left: 12px; }
      .so-menu, .hamb { display: none; }
      .hero { grid-template-columns: 1.15fr 1fr; min-height: min(72dvh, 660px); }
    }
  `,
})
export default class Landing {
  private el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected contato = CONTATO;
  protected ano = new Date().getFullYear();
  protected menu = signal(false);
  protected rolou = signal(false);

  protected secoes = [
    { id: 'funcoes', nome: 'Funções' },
    { id: 'como', nome: 'Como funciona' },
    { id: 'duvidas', nome: 'Dúvidas' },
    { id: 'contato', nome: 'Contato' },
  ];

  protected recursos = [
    { icone: 'bolt', titulo: 'Lançamento em segundos', texto: 'Digite "mercado 120 nubank" e pronto: valor, cartão e categoria saem do texto.' },
    { icone: 'calendar_month', titulo: 'Contas e faturas do mês', texto: 'Contas fixas, faturas de cada cartão e o que já foi pago, com aviso antes de vencer.' },
    { icone: 'show_chart', titulo: 'Saldo dia a dia', texto: 'Veja em que dia o dinheiro fica mais apertado antes do próximo salário.' },
    { icone: 'upload_file', titulo: 'Importar fatura', texto: 'Traga a fatura ou o extrato em CSV/OFX; parcelas e duplicados são tratados sozinhos.' },
    { icone: 'flag', titulo: 'Orçamentos e alertas', texto: 'Limites por categoria e aviso quando algo foge do padrão dos últimos meses.' },
    { icone: 'savings', titulo: 'Cofrinhos com meta', texto: 'Metas com prazo e quanto guardar por mês para chegar lá.' },
    { icone: 'restaurant', titulo: 'Vale-refeição e alimentação', texto: 'Saldo dos benefícios separado do dinheiro, com o uso do mês.' },
    { icone: 'group', titulo: 'Carteira compartilhada', texto: 'Mais de uma pessoa lança na mesma carteira, com chat e comentário em cada gasto.' },
    { icone: 'insights', titulo: 'Relatórios e planejamento', texto: 'Gastos por categoria, cartão e pessoa, e a projeção dos próximos 12 meses.' },
  ];

  protected passos = [
    { titulo: 'Crie sua conta', texto: 'Só nome, e-mail e senha.' },
    { titulo: 'Monte a carteira', texto: 'Cadastre cartões, salário e contas fixas uma vez.' },
    { titulo: 'Lance e acompanhe', texto: 'Gastos no dia a dia e o mês inteiro na tela inicial.' },
  ];

  protected duvidas = [
    { p: 'Quanto custa?', r: 'Nada. O CFP é gratuito.' },
    { p: 'Preciso instalar alguma coisa?', r: 'Não. Funciona no navegador e, no celular, dá para adicionar à tela inicial como um app.' },
    { p: 'O CFP acessa minha conta do banco?', r: 'Não. Você lança os gastos ou importa o arquivo da fatura; nenhuma senha de banco é pedida.' },
    { p: 'Dá para usar com outra pessoa?', r: 'Sim. Compartilhe o código da carteira e os dois lançam e veem tudo na hora.' },
    { p: 'Funciona sem internet?', r: 'O lançamento fica guardado no aparelho e é enviado quando a conexão volta.' },
  ];

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const obs = new IntersectionObserver(
        (es) => {
          for (const e of es) {
            if (!e.isIntersecting) continue;
            e.target.classList.add('visto');
            obs.unobserve(e.target);
          }
        },
        { threshold: 0.15 },
      );
      this.el.nativeElement.querySelectorAll('.rv').forEach((x) => obs.observe(x));
      const rolar = () => this.rolou.set(scrollY > 8);
      addEventListener('scroll', rolar, { passive: true });
      destroy.onDestroy(() => {
        obs.disconnect();
        removeEventListener('scroll', rolar);
      });
    });
  }

  ir(id: string) {
    this.menu.set(false);
    if (id === 'topo') scrollTo({ top: 0, behavior: 'smooth' });
    else this.el.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth' });
  }
}
