import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../core/auth';
import { Bloqueio } from '../core/bloqueio';
import { Insights } from '../core/insights';
import { Categoria, Membro, Regra } from '../core/models';
import { normalizar } from '../core/texto';
import { Painel } from '../core/painel';
import { Push } from '../core/push';
import { Store } from '../core/store';
import { CORES, Cor, Tema } from '../core/tema';
import { q, supabase } from '../core/supabase';
import { PrivPipe, moeda, parseValor } from '../core/formato';
import { addMeses, mesAtual } from '../core/datas';
import { Moeda } from '../shared/moeda';
import { ganho, lembrado } from './calc/comum';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { IconePicker } from '../shared/icone-picker';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { Visor } from '../shared/visor';
import { Ordenar } from '../shared/ordenar';
import { Menus } from '../layout/menu';
import { exportar, lerBackup, restaurar, totalLinhas } from '../core/backup';
import { conviteGuardado, limparConvite, linkConvite } from '../core/convite';
import { Compartilhar, TEXTO_APP } from '../shared/compartilhar';
import { Saida } from '../shared/sair';

@Component({
  imports: [FormsModule, Avatar, Icon, IconePicker, Sheet, Visor, Ordenar, Compartilhar, Moeda, PrivPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Configurações</h1></div>

      <details class="card mais" [open]="aberto('perfil')" (toggle)="lembrar('perfil', $event)">
        <summary><app-icon name="person" [size]="18" />Conta e aparência<span class="small muted">{{ resumoConta() }}</span></summary>
        <form class="form" (ngSubmit)="salvarNome()">
          <p class="small muted">{{ auth.user()?.email }}</p>
          <label class="field"><span>Seu nome</span>
            <div class="linha">
              <input name="nome" [(ngModel)]="nome" />
              <button class="btn ghost" [disabled]="ocupado()">Salvar</button>
            </div>
          </label>
          <div class="field">
            <span>Tema</span>
            <div class="seg">
              <button type="button" [class.on]="tema.modo() === 'auto'" (click)="tema.modo.set('auto')" title="Segue o tema do celular"><app-icon name="contrast" [size]="18" />Automático</button>
              <button type="button" [class.on]="tema.modo() === 'claro'" (click)="tema.modo.set('claro')"><app-icon name="light_mode" [size]="18" />Claro</button>
              <button type="button" [class.on]="tema.modo() === 'escuro'" (click)="tema.modo.set('escuro')"><app-icon name="dark_mode" [size]="18" />Escuro</button>
            </div>
          </div>
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
          <button class="btn ghost" type="button" (click)="indicando.set(true)"><app-icon name="share" [size]="18" />Indicar o CFP</button>
        </form>
      </details>

      <details class="card mais" [open]="aberto('carteira')" (toggle)="lembrar('carteira', $event)">
        <summary><app-icon name="account_balance_wallet" [size]="18" />Carteira<span class="small muted">{{ resumoCarteira() }}</span></summary>
        <div class="form">
        @if (s.carteira(); as c) {
          <div class="convite">
            <div>
              <span class="small muted">Código de convite</span>
              <div class="cod">{{ c.codigo }}</div>
            </div>
            <button class="btn" type="button" (click)="convidando.set(true)" title="Quem entrar com este código lança e vê tudo desta carteira"><app-icon name="share" [size]="18" />Convidar</button>
          </div>
          <app-compartilhar [(open)]="convidando" titulo="Convidar para a carteira" [url]="linkConvite(c.codigo)"
            [texto]="'Entra na nossa carteira ' + c.nome + ' no CFP para controlarmos as finanças juntos! Abra o link, crie sua conta e o código ' + c.codigo + ' já vem preenchido.'" />

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

          <label class="field"><span>Nome da carteira</span>
            <div class="linha">
              <input name="carteira" [(ngModel)]="nomeCarteira" />
              <button class="btn ghost" type="button" (click)="renomear()" [disabled]="ocupado()">Salvar</button>
            </div>
          </label>
          <label class="field"><span>Começou a usar em</span>
            <div class="linha">
              <input name="inicio" type="month" [(ngModel)]="inicioUso" title="Meses anteriores ficam fora da navegação, do fechamento e das comparações. Vazio mostra tudo." />
              <button class="btn ghost" type="button" (click)="salvarInicio()" [disabled]="ocupado()">Salvar</button>
            </div>
          </label>
          <label class="field"><span>Meta de sobra do mês (% das entradas)</span>
            <div class="linha">
              <input name="meta" inputmode="decimal" placeholder="Ex.: 15 (vazio desliga)" [(ngModel)]="metaSobra" />
              <button class="btn ghost" type="button" (click)="salvarMeta()" [disabled]="ocupado()">Salvar</button>
            </div>
          </label>
          <label class="check" title="No lançamento escolhe quem pagou e se o gasto é dividido; o Início mostra quem deve quanto">
            <input type="checkbox" [checked]="s.divisao()" (change)="alternarDivisao()" [disabled]="ocupado()" />
            Dividir gastos entre os membros
          </label>
          @if (s.divisao() && s.membros().length > 1) {
            <label class="check">
              <input type="checkbox" [checked]="proporcional()" (change)="alternarProporcional()" [disabled]="ocupado()" />
              Dividir por percentual (ex.: pela renda de cada um)
            </label>
            @if (proporcional()) {
              <div class="pesos">
                @for (m of s.membros(); track m.user_id) {
                  <label class="peso"><span>{{ m.nome }}</span><input type="number" inputmode="numeric" min="0" max="100" step="1" [ngModel]="pesoDe(m)" (ngModelChange)="mudarPeso(m.user_id, $event)" /><b>%</b></label>
                }
                <p class="small" [class.neg]="somaPesos() !== 100" [class.muted]="somaPesos() === 100">Soma {{ somaPesos() }}%{{ somaPesos() !== 100 ? ': precisa dar 100%' : '' }}</p>
                <div class="grid2">
                  <button class="btn ghost" type="button" (click)="pelaRenda()" [disabled]="ocupado()" title="Usa as entradas avulsas que cada um lançou no mês do topo (entradas fixas não têm dono)"><app-icon name="payments" [size]="18" />Pela renda do mês</button>
                  <button class="btn" type="button" (click)="salvarPesos()" [disabled]="ocupado() || somaPesos() !== 100">Salvar</button>
                </div>
              </div>
            }
          }
          <div class="bts">
            @if (s.souDono()) {
              <button class="btn ghost" type="button" (click)="novoCodigo()" [disabled]="ocupado()"><app-icon name="autorenew" [size]="18" />Novo código</button>
            }
            <button class="btn ghost danger-ink" type="button" (click)="sairCarteira()" [disabled]="ocupado()"><app-icon name="logout" [size]="18" />Sair da carteira</button>
            @if (s.souDono()) {
              <button class="btn danger" type="button" (click)="sairCarteira(true)" [disabled]="ocupado()"><app-icon name="delete" [size]="18" />Excluir carteira</button>
            }
          </div>
        }

        <h2>Outras carteiras</h2>
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
        <label class="field"><span>Entrar com código</span>
          <div class="linha">
            <input id="cfg-codigo" name="codigo" [(ngModel)]="codigo" placeholder="ABCD2345" maxlength="8" class="up" />
            <button class="btn ghost" type="button" (click)="entrarCarteira()" [disabled]="ocupado()">Entrar</button>
          </div>
        </label>
        <label class="field"><span>Criar nova carteira</span>
          <div class="linha">
            <input name="novaCarteira" [(ngModel)]="novaCarteira" placeholder="Nome" />
            <button class="btn ghost" type="button" (click)="criarCarteira()" [disabled]="ocupado()">Criar</button>
          </div>
        </label>
        </div>
      </details>

      @if (s.carteira()) {
        <details class="card mais" [open]="aberto('casal')" (toggle)="lembrar('casal', $event)">
          <summary><app-icon name="favorite" [size]="18" />Casal<span class="small muted">{{ resumoCasal() | priv }}</span></summary>
          <div class="form">
            <h2 title="Gastos marcados como livres aparecem para o outro só no total. Vazio desliga.">Dinheiro livre do mês</h2>
            @for (m of s.membros(); track m.user_id) {
              <label class="peso livre"><span>{{ m.nome }}</span><input moeda="numero" inputmode="numeric" placeholder="0,00" [ngModel]="livreDe(m)" (ngModelChange)="mudarLivre(m.user_id, $event)" /></label>
            }
            <button class="btn ghost" type="button" (click)="salvarLivres()" [disabled]="ocupado()">Salvar</button>

            <h2 title="No começo do mês, parte da sobra do mês que fechou vai sozinha para o cofrinho (dá para desfazer)">Sobra automática para o cofrinho</h2>
            <div class="linha">
              <select name="sobraCof" aria-label="Cofrinho" [(ngModel)]="sobraCofrinho">
                <option [ngValue]="null">Desligada</option>
                @for (k of s.cofrinhos(); track k.id) { <option [ngValue]="k.id">{{ k.nome }}</option> }
              </select>
              @if (sobraCofrinho) { <input name="sobraPct" inputmode="numeric" aria-label="Percentual da sobra" placeholder="%" [(ngModel)]="sobraPct" /> }
            </div>
            <button class="btn ghost" type="button" (click)="salvarSobraAuto()" [disabled]="ocupado()">Salvar</button>

            <h2 title="Mostra no lançamento quanto tempo de trabalho o gasto custa">Custo em horas <span class="small muted">(só neste aparelho)</span></h2>
            <div class="linha">
              <label class="field"><span>Ganho por mês</span><input moeda inputmode="numeric" placeholder="3.000,00" [ngModel]="ganho()" (ngModelChange)="ganho.guardar($event)" /></label>
              <label class="field"><span>Horas por semana</span><input inputmode="numeric" placeholder="44" [ngModel]="semana()" (ngModelChange)="semana.guardar($event)" /></label>
            </div>
          </div>
        </details>
      }

      <details class="card mais" [open]="aberto('avisos')" (toggle)="lembrar('avisos', $event)">
        <summary><app-icon name="notifications" [size]="18" />Notificações<span class="small muted">{{ resumoAvisos() }}</span></summary>
        <div class="form">
        @switch (insights.permissao()) {
          @case ('granted') { <p class="small tit"><app-icon name="check_circle" [size]="18" />Notificações do navegador ativas.</p> }
          @case ('denied') { <p class="small muted">Bloqueadas no navegador. Libere nas configurações do site para receber avisos.</p> }
          @default {
            <button class="btn ghost" type="button" (click)="insights.pedirPermissao()" title="Avisos de contas vencendo e orçamentos estourados"><app-icon name="notifications" [size]="18" />Ativar notificações</button>
          }
        }
        @if (push.disponivel && insights.permissao() !== 'denied') {
          <label class="check">
            <input type="checkbox" [checked]="pushComunicados()" (change)="alternarComunicados()" [disabled]="ocupado()" />
            Avisos do app (novidades e comunicados)
          </label>
          <label class="check">
            <input type="checkbox" [checked]="push.ativo()" (change)="alternarPush()" [disabled]="ocupado()" />
            Avisos com o app fechado (chat, gastos e contas vencendo)
          </label>
          @if (push.ativo()) {
            <label class="check">
              <input type="checkbox" [checked]="lembrete()" (change)="alternarLembrete()" [disabled]="ocupado()" />
              Lembrete às 21h quando ninguém lançou gasto no dia
            </label>
            @if (s.membros().length > 1) {
              <label class="check">
                <input type="checkbox" [checked]="avisoGastos()" (change)="alternarAvisoGastos()" [disabled]="ocupado()" />
                Avisar quando outro membro lançar gasto
              </label>
            }
            <label class="check">
              <input type="checkbox" [checked]="resumoMensal()" (change)="alternarResumo()" [disabled]="ocupado()" />
              Resumo do mês que fechou no dia 1
            </label>
            <label class="check">
              <input type="checkbox" [checked]="opcao('push_fatura')" (change)="alternarOpcao('push_fatura', 'Aviso de fatura fechada')" [disabled]="ocupado()" />
              Quando a fatura do cartão fechar, com o total
            </label>
            @if (s.contasBancarias().length) {
              <label class="check">
                <input type="checkbox" [checked]="opcao('lembrete_saldos')" (change)="alternarOpcao('lembrete_saldos', 'Lembrete dos saldos')" [disabled]="ocupado()" />
                Domingo, se algum saldo bancário estiver sem atualizar há mais de uma semana
              </label>
            }
          }
        }
        </div>
      </details>

      <details class="card mais" [open]="aberto('bloqueio')" (toggle)="lembrar('bloqueio', $event)">
        <summary><app-icon name="lock" [size]="18" />Segurança<span class="small muted">{{ resumoBloqueio() }}</span></summary>
        <div class="form">
        @if (bloqueio.cfg(); as c) {
          <p class="small tit"><app-icon name="lock" [size]="18" />Ligado neste aparelho{{ c.cred ? ', com biometria' : ', com PIN' }}.</p>
          <label class="field"><span>Bloquear depois de sair do app</span>
            <select name="min" [ngModel]="c.minutos" (ngModelChange)="bloqueio.minutos(+$event)">
              @for (m of tempos; track m.v) { <option [ngValue]="m.v">{{ m.r }}</option> }
            </select>
          </label>
          <button class="btn ghost" type="button" (click)="desligarBloqueio()"><app-icon name="lock_open" [size]="18" />Desligar</button>
        } @else {
          <p class="small muted">Pede PIN (ou digital/rosto) ao abrir o app neste aparelho. Esqueceu o PIN: sai da conta e entra de novo com a senha.</p>
          <div class="linha">
            <input name="pin1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="PIN (4 a 8 números)" [(ngModel)]="pin1" />
            <input name="pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="Repita o PIN" [(ngModel)]="pin2" />
          </div>
          @if (bioOk()) {
            <label class="check"><input name="bio" type="checkbox" [(ngModel)]="usarBio" />Desbloquear com a biometria do aparelho</label>
          }
          <label class="field"><span>Bloquear depois de sair do app</span>
            <select name="min" [(ngModel)]="minutosBloqueio">
              @for (m of tempos; track m.v) { <option [ngValue]="m.v">{{ m.r }}</option> }
            </select>
          </label>
          <button class="btn ghost" type="button" (click)="ligarBloqueio()" [disabled]="ocupado()"><app-icon name="lock" [size]="18" />Ligar bloqueio</button>
        }
        </div>
      </details>

      <details class="card mais" [open]="aberto('cat')" (toggle)="lembrar('cat', $event)">
        <summary><app-icon name="sell" [size]="18" />Categorias e regras<span class="small muted">{{ resumoCat() }}</span></summary>
        <div class="cab">
          <div class="seg">
            <button type="button" [class.on]="tipoCat() === 'gasto'" (click)="tipoCat.set('gasto')">Gastos</button>
            <button type="button" [class.on]="tipoCat() === 'entrada'" (click)="tipoCat.set('entrada')">Entradas</button>
          </div>
          <button class="btn sm" type="button" (click)="novaCategoria()"><app-icon name="add" [size]="16" />Nova</button>
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

        <div class="cab">
          <h2 title="Valem para todos da carteira no lançamento, na revisão e na importação; a importação cria as suas sozinha">Regras de categoria</h2>
          <button class="btn sm" type="button" (click)="novaRegra()"><app-icon name="add" [size]="16" />Nova</button>
        </div>
        <p class="small muted">Descrição que contém o texto ganha a categoria.</p>
        @if (s.regras().length > 8) {
          <input class="busca-regra" placeholder="Buscar regra" [ngModel]="buscaRegra()" (ngModelChange)="buscaRegra.set($event)" />
        }
        <div class="list">
          @for (r of regrasVisiveis(); track r.id) {
            <button class="row" type="button" (click)="editarRegra(r)">
              <span class="ico" [style.background]="(s.catMap().get(r.categoria_id ?? '')?.cor ?? '#94a3b8') + '22'" [style.color]="s.catMap().get(r.categoria_id ?? '')?.cor ?? '#94a3b8'">
                <app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'rule'" />
              </span>
              <div class="grow"><div class="t">"{{ r.termo }}"</div><div class="s">{{ s.catMap().get(r.categoria_id ?? '')?.nome ?? 'Sem categoria' }}@if (r.descricao) { · vira "{{ r.descricao }}"}</div></div>
            </button>
          } @empty {
            <p class="small muted">Nenhuma regra ainda.</p>
          }
        </div>
      </details>


      <details class="card mais" [open]="aberto('personalizar')" (toggle)="lembrar('personalizar', $event)">
        <summary><app-icon name="tune" [size]="18" />Personalizar<span class="small muted">{{ resumoPersonalizar() }}</span></summary>
        <div class="form">
          <div class="cab">
            <h2 title="Arraste para mudar a ordem; o olho mostra ou esconde. Toque no título de um bloco no Início para recolher. Vale em todos os aparelhos.">Blocos do Início</h2>
            <button class="btn ghost sm" type="button" (click)="painel.restaurar()">Padrão</button>
          </div>
          <app-ordenar [itens]="painel.lista()" (mover)="painel.mover($event[0], $event[1])" (alternar)="painel.alternarOculto($any($event))" />

          <div class="cab">
            <h2 title="Menu lateral (computador) e Mais (celular). Subir o primeiro item de um grupo leva para o grupo de cima. Vale em todos os aparelhos.">Menu</h2>
            <button class="btn ghost sm" type="button" (click)="menus.restaurar()">Padrão</button>
          </div>
          @for (g of menus.grupos(); track g.nome; let i = $index, ult = $last) {
            <div class="grupo-cab">
              <h3 class="grupo">{{ g.nome }}</h3>
              <button type="button" class="mv" (click)="menus.moverGrupo(i, i - 1)" [disabled]="i === 0" [attr.aria-label]="'Subir o grupo ' + g.nome"><app-icon name="arrow_upward" [size]="18" /></button>
              <button type="button" class="mv" (click)="menus.moverGrupo(i, i + 1)" [disabled]="ult" [attr.aria-label]="'Descer o grupo ' + g.nome"><app-icon name="arrow_downward" [size]="18" /></button>
            </div>
            <app-ordenar [itens]="g.itens" [primeiro]="i > 0" [ultimo]="!ult" (mover)="menus.mover(g.nome, $event[0], $event[1])" (alternar)="menus.alternarOculto($event)" />
          }
          <h3 class="grupo" title="Com o botão escondido, o Chat e a tela Calculadoras continuam no menu">Botões flutuantes</h3>
          <label class="check"><input type="checkbox" [checked]="menus.botao('calc')" (change)="menus.alternarBotao('calc')" />Calculadora rápida</label>
          <label class="check"><input type="checkbox" [checked]="menus.botao('chat')" (change)="menus.alternarBotao('chat')" />Chat <span class="small muted">(com mais de um membro)</span></label>
        </div>
      </details>

      <details class="card mais" [open]="aberto('dados')" (toggle)="lembrar('dados', $event)">
        <summary><app-icon name="cloud_download" [size]="18" />Dados<span class="small muted">Backup de {{ s.carteira()?.nome }}</span></summary>
        <p class="small muted">Restaurar grava o arquivo na carteira atual: o que tem o mesmo registro é substituído e nada é apagado.</p>
        <div class="bts">
          <button class="btn ghost" type="button" (click)="baixarBackup()" [disabled]="ocupado()"><app-icon name="download" [size]="18" />Baixar backup</button>
          <label class="btn ghost" [class.off]="ocupado()"><app-icon name="upload" [size]="18" />Restaurar
            <input type="file" accept=".json,application/json" hidden (change)="restaurarBackup($event)" [disabled]="ocupado()" /></label>
        </div>
      </details>

      <button class="btn danger block" type="button" (click)="sair()"><app-icon name="logout" [size]="18" />Sair</button>
    </div>

    <app-compartilhar [(open)]="indicando" titulo="Indicar o CFP" [url]="origem" [texto]="textoApp" />
    <app-sheet [(open)]="regraAberta" [titulo]="regra.id ? 'Editar regra' : 'Nova regra'">
      <form class="form" (ngSubmit)="salvarRegra()">
        <label class="field"><span>Quando a descrição contém</span><input name="t" autocomplete="off" placeholder="Ex.: uber, ifood, posto" [(ngModel)]="regra.termo" /></label>
        <label class="field"><span>Categoria</span>
          <select name="c" [(ngModel)]="regra.categoria_id">
            <option [ngValue]="null">Sem categoria</option>
            @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
        <label class="field"><span>Nome na importação (opcional)</span><input name="d" autocomplete="off" placeholder="Ex.: Uber" [(ngModel)]="regra.descricao" /></label>
        <button class="btn block" [disabled]="ocupado()">Salvar</button>
        @if (regra.id) { <button class="btn danger block" type="button" (click)="excluirRegra()">Excluir</button> }
      </form>
    </app-sheet>

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
        @if (cat.tipo === 'gasto') {
          <label class="check"><input name="ded" type="checkbox" [(ngModel)]="cat.dedutivel" />Dedutível no Imposto de Renda (saúde, educação)</label>
        }
        <button class="btn block" [disabled]="ocupado()">Salvar</button>
        @if (cat.id) {
          <button class="btn danger block" type="button" (click)="excluirCategoria()">Excluir categoria</button>
        }
      </form>
    </app-sheet>

    <app-visor [(url)]="foto" />
  `,
  styles: `
    .pesos { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
    .peso { display: grid; grid-template-columns: minmax(0, 1fr) 80px auto; align-items: center; gap: 8px; }
    .peso input { text-align: right; }
    .livre { grid-template-columns: minmax(0, 1fr) 130px; }
    .linha .field { flex: 1; min-width: 0; }
    .linha { display: flex; gap: 8px; }
    .cores { display: flex; gap: 10px; flex-wrap: wrap; }
    .cores button {
      width: 38px; height: 38px; border-radius: 50%; border: 3px solid var(--card); background: var(--c); color: #fff;
      box-shadow: 0 0 0 1px var(--line); cursor: pointer; display: grid; place-items: center;
    }
    .cores button.on { box-shadow: 0 0 0 2px var(--c); }
    .foto { border: 0; padding: 0; background: none; border-radius: 50%; cursor: pointer; }
    .foto:disabled { cursor: default; }
    .linha input { flex: 2; min-width: 0; }
    .linha select { flex: 3; min-width: 0; }
    .convite { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; background: var(--primary-soft); border-radius: 14px; padding: 12px; }
    .cod { font-size: 1.5rem; font-weight: 800; letter-spacing: 0.2em; color: var(--primary); }
    .cor { width: 14px; height: 14px; border-radius: 50%; }
    .up { text-transform: uppercase; letter-spacing: 0.15em; }
    .seg { margin-bottom: 6px; }
    .linha .btn { flex: 1; }
    .danger-ink { color: var(--danger); }
    .tit { display: flex; align-items: center; gap: 6px; flex: 1; border: 0; background: none; padding: 0; font: inherit; color: var(--ink); cursor: pointer; text-align: left; }
    .bts { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn.off { opacity: 0.5; pointer-events: none; }
    .cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .cab h2 { margin: 0; }
    .cab .seg { margin: 0; flex: 1; }
    details.mais .form { display: flex; flex-direction: column; gap: 12px; }
    details.mais .form h2 { margin: 8px 0 0; }
    .grupo-cab { display: flex; align-items: center; gap: 4px; margin-top: 6px; border-radius: 10px; background: var(--card-2); padding: 0 4px 0 10px; }
    .grupo-cab .grupo { flex: 1; margin: 0; }
    .mv { border: 0; background: none; color: var(--ink-2); cursor: pointer; padding: 6px; border-radius: 8px; display: grid; }
    .mv:disabled { opacity: 0.3; cursor: default; }
    .grupo { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin-top: 6px; }
  `,
})
export default class Config {
  protected auth = inject(Auth);
  private saida = inject(Saida);
  protected s = inject(Store);
  protected insights = inject(Insights);
  protected tema = inject(Tema);
  protected painel = inject(Painel);
  protected menus = inject(Menus);
  protected abertos = signal<Record<string, boolean>>(lerAbertos());
  protected cores = (Object.keys(CORES) as Cor[]).map((id) => ({ id, hex: CORES[id].hex, nome: CORES[id].nome }));
  protected push = inject(Push);
  protected bloqueio = inject(Bloqueio);
  protected bioOk = signal(false);
  protected tempos = [{ v: 0, r: 'Na hora' }, { v: 1, r: '1 minuto' }, { v: 5, r: '5 minutos' }, { v: 15, r: '15 minutos' }];
  pin1 = '';
  pin2 = '';
  usarBio = true;
  minutosBloqueio = 1;
  private toast = inject(Toast);
  private router = inject(Router);

  protected ocupado = signal(false);
  protected foto = signal<string | null>(null);
  protected catAberta = signal(false);
  protected tipoCat = signal<'gasto' | 'entrada'>('gasto');
  protected cats = computed(() => this.s.categorias().filter((c) => c.tipo === this.tipoCat()));

  nome = this.auth.nome();
  nomeCarteira = this.s.carteira()?.nome ?? '';
  inicioUso = this.s.inicio()?.slice(0, 7) ?? '';
  metaSobra = String(this.s.carteira()?.meta_sobra ?? '').replace('.', ',');
  novaCarteira = '';
  /** convite aberto por link por quem já tem carteira: o código vem preenchido em Entrar com código */
  codigo = conviteGuardado();
  protected convidando = signal(false);
  protected indicando = signal(false);
  protected origem = location.origin;
  protected textoApp = TEXTO_APP;
  protected linkConvite = linkConvite;
  cat = { id: '', nome: '', icone: 'sell', cor: '#64748b', tipo: 'gasto' as 'gasto' | 'entrada', ordem: 50, dedutivel: false };

  constructor() {
    this.bloqueio.bioDisponivel().then((v) => this.bioOk.set(v));
    q<{ push_comunicados: boolean } | null>(supabase.from('usuario_prefs').select('push_comunicados').maybeSingle())
      .then((r) => this.pushComunicados.set(r?.push_comunicados !== false))
      .catch(() => undefined);
    if (this.codigo) {
      this.abertos.update((a) => ({ ...a, carteira: true }));
      afterNextRender(() => document.getElementById('cfg-codigo')?.scrollIntoView({ block: 'center' }));
      limparConvite();
      this.toast.ok(`Convite ${this.codigo} carregado em Carteira: toque em Entrar`);
    }
  }

  async ligarBloqueio() {
    if (!/^\d{4,8}$/.test(this.pin1)) return this.toast.erro('O PIN tem de 4 a 8 números');
    if (this.pin1 !== this.pin2) return this.toast.erro('Os PINs não batem');
    const ok = await this.exec(() => this.bloqueio.ativar(this.pin1, this.bioOk() && this.usarBio, this.minutosBloqueio), 'Bloqueio ligado');
    if (ok) this.pin1 = this.pin2 = '';
  }

  desligarBloqueio() {
    if (!confirm('Desligar o bloqueio neste aparelho?')) return;
    this.bloqueio.desativar();
    this.toast.ok('Bloqueio desligado');
  }

  async baixarBackup() {
    const c = this.s.carteira();
    if (!c) return;
    this.ocupado.set(true);
    try {
      const b = await exportar(c.id, c.nome);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }));
      a.download = `cfp-${c.nome.replace(/[^\w-]+/g, '_')}-${b.exportado_em.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.toast.ok(`Backup com ${totalLinhas(b)} registros`);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async restaurarBackup(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    const c = this.s.carteira();
    if (!f || !c) return;
    try {
      const b = lerBackup(await f.text());
      if (!confirm(`Restaurar ${totalLinhas(b)} registros do backup "${b.carteira}" de ${new Date(b.exportado_em).toLocaleDateString('pt-BR')} na carteira ${c.nome}?`)) return;
      this.ocupado.set(true);
      await restaurar(b, c.id);
      await this.s.carregarTudo();
      await this.s.carregarMes();
      this.toast.ok('Backup restaurado');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Seções recolhidas, lembradas em cfp.config.<secao>; só Conta abre por padrão */
  aberto(id: string) {
    return this.abertos()[id] ?? id === 'perfil';
  }

  lembrar(id: string, e: Event) {
    const v = (e.target as HTMLDetailsElement).open;
    if (v === this.aberto(id)) return;
    this.abertos.update((a) => ({ ...a, [id]: v }));
    try {
      localStorage.setItem('cfp.config.' + id, v ? '1' : '0');
    } catch {}
  }

  protected resumoConta = computed(() => {
    const modo = { auto: 'Tema automático', claro: 'Tema claro', escuro: 'Tema escuro' }[this.tema.modo()];
    return `${modo} · ${CORES[this.tema.cor()].nome.toLowerCase()}`;
  });
  protected resumoCarteira = computed(() => {
    const c = this.s.carteira();
    if (!c) return 'Nenhuma';
    const n = this.s.membros().length;
    return `${c.nome} · ${n} ${n === 1 ? 'membro' : 'membros'} · código ${c.codigo}`;
  });
  protected resumoCasal = computed(() => {
    const eu = this.auth.user()?.id;
    const l = this.s.membros().filter((m) => m.livre).map((m) => `${m.user_id === eu ? 'você' : m.nome} ${moeda(m.livre!)}`);
    return l.length ? 'Livre: ' + l.join(', ') : this.s.carteira()?.sobra_cofrinho ? 'Sobra automática ligada' : 'Dinheiro livre desligado';
  });
  protected resumoAvisos = computed(() => {
    const p = this.insights.permissao();
    if (p === 'denied') return 'Bloqueadas no navegador';
    if (this.push.ativo()) return 'Push ligado';
    return p === 'granted' ? 'Só com o app aberto' : 'Desligadas';
  });
  protected resumoBloqueio = computed(() => {
    const c = this.bloqueio.cfg();
    if (!c) return 'Bloqueio desligado';
    return `${c.cred ? 'Biometria' : 'PIN'} · ${this.tempos.find((t) => t.v === c.minutos)?.r.toLowerCase() ?? c.minutos + ' min'}`;
  });
  protected resumoCat = computed(() => `${this.s.categorias().length} categorias · ${this.s.regras().length} regras`);
  protected resumoPersonalizar = computed(() => {
    const blocos = this.painel.lista().filter((b) => b.oculto).length;
    const menu = this.menus.lista().filter((a) => a.oculto).length;
    return blocos || menu ? [blocos && `${blocos} blocos ocultos`, menu && `${menu} itens fora do menu`].filter(Boolean).join(' · ') : 'Início e menu no padrão';
  });

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

  protected lembrete = computed(() => this.s.membros().find((m) => m.user_id === this.auth.user()?.id)?.lembrete !== false);

  /** Divisão por percentual: ligada quando todos os membros têm peso salvo */
  private pesosSalvos = computed(() => this.s.membros().length > 1 && this.s.membros().every((m) => m.peso != null));
  private editandoPesos = signal<boolean | null>(null);
  protected proporcional = computed(() => this.editandoPesos() ?? this.pesosSalvos());
  private pesos = signal<Record<string, number>>({});
  protected pesoDe = (m: Membro) => this.pesos()[m.user_id] ?? m.peso ?? Math.round(100 / this.s.membros().length);
  protected somaPesos = computed(() => this.s.membros().reduce((a, m) => a + (Number(this.pesoDe(m)) || 0), 0));
  mudarPeso(id: string, v: number) {
    this.pesos.update((p) => ({ ...p, [id]: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) }));
  }

  alternarProporcional() {
    if (!this.proporcional()) return this.editandoPesos.set(true);
    this.editandoPesos.set(false);
    this.pesos.set({});
    if (this.pesosSalvos()) this.gravarPesos({}, 'Divisão por igual');
  }

  pelaRenda() {
    const ms = this.s.membros();
    const renda = ms.map((m) => this.s.entradasMes().filter((e) => e.criado_por === m.user_id).reduce((a, e) => a + e.valor, 0));
    const total = renda.reduce((a, b) => a + b, 0);
    if (!total) return this.toast.erro('Nenhuma entrada avulsa lançada pelos membros neste mês');
    const pct = renda.map((v) => Math.round((v / total) * 100));
    pct[pct.length - 1] += 100 - pct.reduce((a, b) => a + b, 0);
    this.pesos.set(Object.fromEntries(ms.map((m, i) => [m.user_id, pct[i]])));
  }

  salvarPesos() {
    this.gravarPesos(Object.fromEntries(this.s.membros().map((m) => [m.user_id, this.pesoDe(m)])), 'Divisão por percentual salva');
  }

  private gravarPesos(p_pesos: Record<string, number>, ok: string) {
    return this.exec(async () => {
      await q(supabase.rpc('definir_pesos', { p_carteira: this.s.carteiraId()!, p_pesos }));
      await this.s.iniciar();
      this.editandoPesos.set(null);
      this.pesos.set({});
    }, ok);
  }

  alternarDivisao() {
    const divisao = !this.s.divisao();
    return this.exec(async () => {
      await q(supabase.from('carteiras').update({ divisao }).eq('id', this.s.carteiraId()!));
      await this.s.iniciar();
    }, divisao ? 'Divisão ligada' : 'Divisão desligada');
  }

  protected avisoGastos = computed(() => this.s.membros().find((m) => m.user_id === this.auth.user()?.id)?.push_gastos !== false);

  alternarAvisoGastos() {
    const push_gastos = !this.avisoGastos();
    return this.exec(async () => {
      await q(supabase.from('carteira_membros').update({ push_gastos }).eq('carteira_id', this.s.carteiraId()!).eq('user_id', this.auth.user()!.id));
      await this.s.carregarTudo();
    }, push_gastos ? 'Aviso de gastos ligado' : 'Aviso de gastos desligado');
  }

  protected resumoMensal = computed(() => this.s.membros().find((m) => m.user_id === this.auth.user()?.id)?.resumo_mensal !== false);

  alternarResumo() {
    const resumo_mensal = !this.resumoMensal();
    return this.exec(async () => {
      await q(supabase.from('carteira_membros').update({ resumo_mensal }).eq('carteira_id', this.s.carteiraId()!).eq('user_id', this.auth.user()!.id));
      await this.s.carregarTudo();
    }, resumo_mensal ? 'Resumo mensal ligado' : 'Resumo mensal desligado');
  }

  protected pushComunicados = signal(true);

  async alternarComunicados() {
    const push_comunicados = !this.pushComunicados();
    const ok = await this.exec(() => q(supabase.from('usuario_prefs').upsert({ user_id: this.auth.uid()!, push_comunicados })), push_comunicados ? 'Avisos do app ligados' : 'Avisos do app desligados');
    if (ok !== false) this.pushComunicados.set(push_comunicados);
  }

  /** opção de aviso do membro (ligada por padrão) */
  opcao(k: 'push_fatura' | 'lembrete_saldos') {
    return this.s.membros().find((m) => m.user_id === this.auth.user()?.id)?.[k] !== false;
  }

  alternarOpcao(k: 'push_fatura' | 'lembrete_saldos', nome: string) {
    const v = !this.opcao(k);
    return this.exec(async () => {
      await q(supabase.from('carteira_membros').update({ [k]: v }).eq('carteira_id', this.s.carteiraId()!).eq('user_id', this.auth.user()!.id));
      await this.s.carregarTudo();
    }, `${nome} ${v ? 'ligado' : 'desligado'}`);
  }

  protected buscaRegra = signal('');
  protected regrasVisiveis = computed(() => {
    const b = normalizar(this.buscaRegra());
    const cats = this.s.catMap();
    return this.s.regras().filter((r) => !b || normalizar(r.termo).includes(b) || normalizar(cats.get(r.categoria_id ?? '')?.nome ?? '').includes(b)).slice(0, 100);
  });
  protected regraAberta = signal(false);
  regra: { id?: string; termo: string; categoria_id: string | null; descricao: string } = { termo: '', categoria_id: null, descricao: '' };

  novaRegra() {
    this.regra = { termo: '', categoria_id: null, descricao: '' };
    this.regraAberta.set(true);
  }

  editarRegra(r: Regra) {
    this.regra = { id: r.id, termo: r.termo, categoria_id: r.categoria_id, descricao: r.descricao ?? '' };
    this.regraAberta.set(true);
  }

  salvarRegra() {
    const termo = normalizar(this.regra.termo);
    if (!termo) return this.toast.erro('Informe o texto');
    const { id, categoria_id } = this.regra;
    return this.exec(async () => {
      await this.s.salvar('regras', { id, termo, categoria_id, descricao: this.regra.descricao.trim() || null });
      this.regraAberta.set(false);
    }, 'Regra salva');
  }

  excluirRegra() {
    if (!this.regra.id) return;
    this.s.excluirAdiado('regras', this.regra.id, 'Regra excluída');
    this.regraAberta.set(false);
  }

  alternarLembrete() {
    const lembrete = !this.lembrete();
    return this.exec(async () => {
      await q(supabase.from('carteira_membros').update({ lembrete }).eq('carteira_id', this.s.carteiraId()!).eq('user_id', this.auth.user()!.id));
      await this.s.carregarTudo();
    }, lembrete ? 'Lembrete ligado' : 'Lembrete desligado');
  }

  protected ganho = ganho;
  protected semana = lembrado('cfp.horas.semana', '44');
  sobraCofrinho: string | null = this.s.carteira()?.sobra_cofrinho ?? null;
  sobraPct = String(this.s.carteira()?.sobra_pct ?? '').replace('.', ',');
  private livres = signal<Record<string, number | null>>({});
  protected livreDe = (m: Membro) => (m.user_id in this.livres() ? this.livres()[m.user_id] : (m.livre ?? null));
  mudarLivre(id: string, v: number | null) {
    this.livres.update((l) => ({ ...l, [id]: v }));
  }

  salvarLivres() {
    const valores = Object.fromEntries(this.s.membros().map((m) => [m.user_id, this.livreDe(m) || null]));
    return this.exec(async () => {
      await this.s.definirLivres(valores);
      this.livres.set({});
    }, 'Dinheiro livre salvo');
  }

  salvarSobraAuto() {
    const c = this.s.carteira();
    if (!c) return;
    const pct = parseValor(this.sobraPct);
    if (this.sobraCofrinho && (pct < 1 || pct > 100)) return this.toast.erro('Percentual entre 1 e 100');
    // ao ligar, começa no próximo fechamento: meses já fechados não são guardados
    const dados = this.sobraCofrinho
      ? { sobra_cofrinho: this.sobraCofrinho, sobra_pct: pct, ...(c.sobra_feita ? {} : { sobra_feita: addMeses(mesAtual(), -1) }) }
      : { sobra_cofrinho: null, sobra_pct: null };
    return this.exec(async () => {
      await q(supabase.from('carteiras').update(dados).eq('id', c.id));
      await this.s.iniciar();
    }, this.sobraCofrinho ? 'Sobra automática ligada' : 'Sobra automática desligada');
  }

  private lerCarteira() {
    this.sobraCofrinho = this.s.carteira()?.sobra_cofrinho ?? null;
    this.sobraPct = String(this.s.carteira()?.sobra_pct ?? '').replace('.', ',');
    this.nomeCarteira = this.s.carteira()?.nome ?? '';
    this.inicioUso = this.s.inicio()?.slice(0, 7) ?? '';
    this.metaSobra = String(this.s.carteira()?.meta_sobra ?? '').replace('.', ',');
  }

  salvarMeta() {
    const v = parseValor(this.metaSobra);
    if (v < 0 || v >= 100) return this.toast.erro('Meta entre 1 e 99%');
    const meta_sobra = v || null;
    return this.exec(async () => {
      await q(supabase.from('carteiras').update({ meta_sobra }).eq('id', this.s.carteiraId()!));
      await this.s.iniciar();
    }, meta_sobra ? 'Meta salva' : 'Meta desligada');
  }

  salvarInicio() {
    const inicio = this.inicioUso ? `${this.inicioUso}-01` : null;
    return this.exec(async () => {
      await q(supabase.from('carteiras').update({ inicio }).eq('id', this.s.carteiraId()!));
      await this.s.iniciar();
      await this.s.carregarMes();
    }, 'Início do uso salvo');
  }

  novaCategoria() {
    this.cat = { id: '', nome: '', icone: 'sell', cor: '#64748b', tipo: this.tipoCat(), ordem: 50, dedutivel: false };
    this.catAberta.set(true);
  }

  editarCategoria(c: Categoria) {
    this.cat = { id: c.id, nome: c.nome, icone: c.icone, cor: c.cor, tipo: c.tipo, ordem: c.ordem, dedutivel: !!c.dedutivel };
    this.catAberta.set(true);
  }

  async salvarCategoria() {
    if (!this.cat.nome.trim()) return this.toast.erro('Informe o nome');
    const { id, dedutivel, ...dados } = this.cat;
    // só manda a coluna quando muda algo nela: banco sem a migration 033 segue aceitando
    const antes = !!this.s.catMap().get(id)?.dedutivel;
    const ded = dedutivel || antes ? { dedutivel: dados.tipo === 'gasto' && dedutivel } : {};
    const ok = await this.exec(
      () => this.s.salvar('categorias', { id: id || undefined, ...dados, ...ded, nome: dados.nome.trim(), icone: dados.icone || 'sell', ordem: +dados.ordem || 0 }),
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
    this.lerCarteira();
    this.toast.ok(`Carteira: ${this.s.carteira()?.nome}`);
  }

  async criarCarteira() {
    const nome = this.novaCarteira.trim();
    if (!nome) return this.toast.erro('Informe o nome');
    if (await this.exec(() => this.s.criarCarteira(nome), 'Carteira criada')) {
      this.novaCarteira = '';
      this.lerCarteira();
    }
  }

  async entrarCarteira() {
    if (!this.codigo.trim()) return this.toast.erro('Informe o código');
    if (await this.exec(() => this.s.entrarCarteira(this.codigo), 'Você entrou na carteira')) {
      this.codigo = '';
      this.lerCarteira();
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
    else this.lerCarteira();
  }

  alternarPush() {
    const ativo = this.push.ativo();
    return this.exec(() => (ativo ? this.push.desativar() : this.push.ativar()), ativo ? 'Avisos desligados' : 'Avisos ligados');
  }

  sair() {
    this.saida.abrir();
  }
}

const SECOES = ['perfil', 'carteira', 'casal', 'avisos', 'bloqueio', 'cat', 'personalizar', 'dados'];

function lerAbertos(): Record<string, boolean> {
  const a: Record<string, boolean> = {};
  try {
    for (const k of SECOES) {
      const v = localStorage.getItem('cfp.config.' + k);
      if (v) a[k] = v === '1';
    }
  } catch {}
  return a;
}
