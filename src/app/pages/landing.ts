import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../shared/icon';

/** Apresentação para quem ainda não entrou */
@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topo">
      <span class="marca"><span class="logo">CFP</span><span class="nome">Controle Financeiro Pessoal</span></span>
      <nav>
        <a routerLink="/login" class="btn ghost sm">Entrar</a>
        <a routerLink="/login" [queryParams]="{ criar: 1 }" class="btn sm">Criar conta</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <div class="texto">
          <span class="selo"><app-icon name="favorite" [size]="16" [fill]="true" />Feito para o casal</span>
          <h1>O dinheiro da casa, <em>num lugar só.</em></h1>
          <p class="lead">Lance um gasto em segundos, acompanhe contas e faturas do mês e saiba quanto sobra antes do salário cair.</p>
          <div class="ctas">
            <a routerLink="/login" [queryParams]="{ criar: 1 }" class="btn grande">Criar conta grátis<app-icon name="arrow_forward" [size]="20" /></a>
            <a routerLink="/login" class="btn ghost grande">Já tenho conta</a>
          </div>
          <p class="nota"><app-icon name="install_mobile" [size]="18" />Funciona no navegador e pode ser instalado no celular.</p>
        </div>

        <div class="tela" aria-hidden="true">
          <div class="saldo">
            <small>Saldo previsto do mês</small>
            <strong>R$ 2.184,90</strong>
            <div class="es">
              <span><i>↑ Entradas</i><b class="sobe">R$ 7.450,00</b></span>
              <span><i>↓ Saídas</i><b class="desce">R$ 5.265,10</b></span>
            </div>
            <svg viewBox="0 0 200 50" preserveAspectRatio="none"><path d="M0,40 L18,38 L30,12 L55,16 L80,22 L100,30 L120,28 L140,34 L165,36 L200,20" /></svg>
          </div>
          <div class="item"><span class="ico c1"><app-icon name="shopping_cart" [size]="20" /></span><span class="t">Mercado<small>Hoje · Nubank</small></span><b>R$ 312,40</b></div>
          <div class="item"><span class="ico c2"><app-icon name="bolt" [size]="20" /></span><span class="t">Luz<small>Vence em 2 dias</small></span><span class="badge alerta">2d</span></div>
          <div class="item"><span class="ico c3"><app-icon name="savings" [size]="20" /></span><span class="t">Viagem<small>Meta 68%</small></span><span class="mini"><i></i></span></div>
        </div>
      </section>

      <section class="recursos">
        <h2>Tudo o que o mês pede</h2>
        <div class="grade">
          @for (r of recursos; track r.titulo) {
            <article>
              <span class="ri"><app-icon [name]="r.icone" [size]="24" /></span>
              <h3>{{ r.titulo }}</h3>
              <p>{{ r.texto }}</p>
            </article>
          }
        </div>
      </section>

      <section class="passos">
        <h2>Como começar</h2>
        <ol>
          <li><b>Crie sua conta</b><span>Só nome, e-mail e senha.</span></li>
          <li><b>Monte a carteira</b><span>Cadastre cartões, salário e contas fixas uma vez.</span></li>
          <li><b>Chame quem divide a casa</b><span>Compartilhe o código de convite e lancem juntos.</span></li>
        </ol>
      </section>

      <section class="final">
        <h2>Comece hoje e feche o mês sem susto.</h2>
        <div class="ctas">
          <a routerLink="/login" [queryParams]="{ criar: 1 }" class="btn grande">Criar conta</a>
          <a routerLink="/login" class="btn ghost grande">Entrar</a>
        </div>
      </section>
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--bg); }
    .topo {
      position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; gap: 12px;
      padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px; max-width: 1080px; margin: 0 auto;
      background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px);
    }
    .marca { display: flex; align-items: center; gap: 10px; font-weight: 800; }
    .logo { background: var(--primary); color: var(--primary-ink); border-radius: 10px; padding: 6px 9px; letter-spacing: 0.04em; }
    .nome { display: none; }
    nav { display: flex; gap: 8px; }
    main { max-width: 1080px; margin: 0 auto; padding: 8px 16px 48px; display: flex; flex-direction: column; gap: 56px; }

    .hero { display: grid; gap: 32px; align-items: center; padding-top: 16px; }
    .selo {
      display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: var(--primary);
      background: var(--primary-soft); padding: 5px 12px; border-radius: 999px;
    }
    h1 { font-size: clamp(2rem, 7vw, 3.4rem); line-height: 1.05; letter-spacing: -0.035em; margin: 14px 0 12px; }
    h1 em { font-style: normal; color: var(--primary); }
    .lead { font-size: 1.08rem; color: var(--ink-2); max-width: 34ch; }
    .ctas { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    .grande { min-height: 52px; padding: 14px 22px; font-size: 1rem; border-radius: 14px; }
    .nota { display: flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 0.85rem; color: var(--ink-3); }

    .tela {
      justify-self: center; width: min(100%, 360px); padding: 14px; border-radius: 28px; display: flex; flex-direction: column; gap: 10px;
      background: var(--card); border: 1px solid var(--line); box-shadow: 0 30px 60px -20px rgb(17 24 39 / 0.35);
      transform: rotate(-1.5deg);
    }
    .saldo { background: var(--hero); color: #fff; border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
    .saldo small { opacity: 0.8; font-weight: 600; font-size: 0.75rem; }
    .saldo strong { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.03em; }
    .es { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .es span { background: rgb(255 255 255 / 0.12); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; }
    .es i { font-style: normal; font-size: 0.7rem; opacity: 0.85; font-weight: 600; }
    .es b { font-size: 0.9rem; }
    .sobe { color: #4ade80; }
    .desce { color: #ff7a7a; }
    .saldo svg { width: 100%; height: 44px; margin-top: 6px; }
    .saldo path { fill: none; stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; opacity: 0.85; }
    .item { display: flex; align-items: center; gap: 10px; padding: 6px 4px; }
    .item .t { flex: 1; display: flex; flex-direction: column; font-weight: 700; font-size: 0.9rem; }
    .item small { font-weight: 500; color: var(--ink-2); font-size: 0.75rem; }
    .item b { font-variant-numeric: tabular-nums; font-size: 0.9rem; }
    .ico { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; }
    .c1 { background: #10b98122; color: #10b981; }
    .c2 { background: #f59e0b22; color: #d97706; }
    .c3 { background: #8b5cf622; color: #8b5cf6; }
    .mini { width: 64px; height: 6px; border-radius: 999px; background: var(--card-2); overflow: hidden; }
    .mini i { display: block; width: 68%; height: 100%; background: #8b5cf6; }

    h2 { font-size: clamp(1.4rem, 4vw, 1.9rem); letter-spacing: -0.02em; margin-bottom: 18px; }
    .grade { display: grid; gap: 12px; }
    article { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 6px; }
    .ri { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); margin-bottom: 4px; }
    article p { color: var(--ink-2); font-size: 0.92rem; }

    ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; counter-reset: p; }
    li { counter-increment: p; display: grid; grid-template-columns: 44px 1fr; column-gap: 12px; align-items: center; }
    li::before {
      content: counter(p); grid-row: span 2; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
      background: var(--ink); color: var(--bg); font-weight: 800;
    }
    li span { color: var(--ink-2); font-size: 0.92rem; }

    .final { text-align: center; background: var(--hero); color: #fff; border-radius: 26px; padding: 36px 20px; }
    .final h2 { margin: 0 auto; max-width: 22ch; }
    .final .ctas { justify-content: center; }
    .final .ghost { background: rgb(255 255 255 / 0.12); color: #fff; border-color: rgb(255 255 255 / 0.2); }

    @media (min-width: 720px) {
      .nome { display: inline; }
      .grade { grid-template-columns: repeat(3, 1fr); }
      ol { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 960px) {
      .hero { grid-template-columns: 1.15fr 1fr; min-height: min(70dvh, 640px); }
    }
  `,
})
export default class Landing {
  protected recursos = [
    { icone: 'bolt', titulo: 'Lançamento em segundos', texto: 'Digite "mercado 120 nubank" e pronto: valor, cartão e categoria saem do texto.' },
    { icone: 'calendar_month', titulo: 'Contas e faturas do mês', texto: 'Contas fixas, faturas de cada cartão e o que já foi pago, com aviso antes de vencer.' },
    { icone: 'show_chart', titulo: 'Saldo dia a dia', texto: 'Veja em que dia o dinheiro fica mais apertado antes do próximo salário.' },
    { icone: 'group', titulo: 'Carteira compartilhada', texto: 'Os dois lançam na mesma carteira, com chat e comentário em cada gasto.' },
    { icone: 'flag', titulo: 'Orçamentos e alertas', texto: 'Limites por categoria e aviso quando algo foge do padrão dos últimos meses.' },
    { icone: 'savings', titulo: 'Cofrinhos com meta', texto: 'Metas com prazo e quanto guardar por mês para chegar lá juntos.' },
  ];
}
