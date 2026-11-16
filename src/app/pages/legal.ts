import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTATO, TERMOS_VERSAO } from '../core/legal';
import { Icon } from '../shared/icon';

/** Termos de uso e Política de privacidade (rotas públicas /termos e /privacidade) */
@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="wrap">
      <button type="button" class="voltar" (click)="voltar()"><app-icon name="arrow_back" [size]="18" />Voltar</button>
      @if (doc() === 'termos') {
        <h1>Termos de uso</h1>
        <p class="muted small">Versão de {{ versao }}</p>

        <h2>1. O que é o CFP</h2>
        <p>O CFP (Controle Financeiro Pessoal) é um aplicativo para organizar as finanças de uma pessoa ou de um casal: gastos, contas, cartões, entradas, metas e relatórios. Ao criar a conta ou continuar usando o app, você concorda com estes termos e com a <a routerLink="/privacidade">Política de privacidade</a>.</p>

        <h2>2. Conta</h2>
        <p>Você precisa de um e-mail válido (ou login Google/Apple) e é responsável por manter a senha em segredo. Recomendamos ativar a verificação em duas etapas em Minha conta → Segurança e privacidade. Avise-nos se suspeitar de acesso indevido.</p>

        <h2>3. Carteira compartilhada</h2>
        <p>Quem entra numa carteira pelo código de convite vê e altera os dados dela. O dono pode remover membros; qualquer membro pode sair. O que você lançou numa carteira compartilhada continua visível para os outros membros mesmo se você sair ou excluir sua conta, sem seu nome.</p>

        <h2>4. Não é consultoria</h2>
        <p>Previsões, simulações, rendimentos, impostos e taxas mostrados pelo app são estimativas feitas a partir do que você informa e de fontes públicas (como o Banco Central). Não são recomendação de investimento, contábil ou jurídica. Confira sempre com o seu banco antes de decidir.</p>

        <h2>5. Uso permitido</h2>
        <p>Não use o CFP para atividade ilegal, para guardar dados de terceiros sem autorização, para tentar acessar dados de outras carteiras ou para sobrecarregar o serviço. Podemos suspender contas que descumpram estes termos.</p>

        <h2>6. Disponibilidade</h2>
        <p>Fazemos o possível para manter o app no ar e os dados seguros, mas ele pode ficar fora do ar para manutenção ou por falha de terceiros. Baixe o backup da carteira de tempos em tempos (Configurações → Baixar backup).</p>

        <h2>7. Encerramento</h2>
        <p>Você pode excluir sua conta a qualquer momento em Minha conta → Segurança e privacidade → Excluir conta. A exclusão é definitiva.</p>

        <h2>8. Responsabilidade</h2>
        <p>Na medida permitida pela lei, o CFP não responde por decisões financeiras tomadas com base no app nem por dados informados de forma errada. Nada aqui limita direitos garantidos pelo Código de Defesa do Consumidor.</p>

        <h2>9. Mudanças e lei aplicável</h2>
        <p>Se estes termos mudarem, o app pede um novo aceite. Vale a lei brasileira.</p>
      } @else {
        <h1>Política de privacidade</h1>
        <p class="muted small">Versão de {{ versao }} · em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018)</p>

        <h2>1. Dados que guardamos</h2>
        <ul>
          <li><b>Conta:</b> nome, e-mail, foto de perfil (opcional) e, se usar, o identificador do login Google/Apple.</li>
          <li><b>Finanças que você lança:</b> gastos, entradas, contas, cartões (só nome, dias e final de 4 dígitos, nunca o número completo), saldos, cofrinhos, metas, comprovantes anexados e mensagens do chat da carteira.</li>
          <li><b>WhatsApp (opcional):</b> o número de telefone vinculado e as mensagens enviadas ao bot.</li>
          <li><b>Uso técnico:</b> dia de acesso, erros do app e inscrição de notificações do aparelho, para manter o serviço funcionando.</li>
        </ul>
        <p>Leitura de fotos e PDFs de comprovante é feita no próprio aparelho. O bloqueio por PIN/biometria fica só no aparelho.</p>

        <h2>2. Para que usamos</h2>
        <p>Só para prestar o serviço: mostrar e calcular suas finanças, sincronizar entre aparelhos e membros da carteira, enviar os avisos que você ativou e corrigir falhas. Não vendemos dados nem usamos para publicidade. Base legal: execução do contrato (art. 7º, V) e, para notificações e WhatsApp, o seu consentimento (art. 7º, I), que pode ser retirado nas Configurações.</p>

        <h2>3. Com quem compartilhamos</h2>
        <p>Com operadores que hospedam o serviço, sob contrato: Supabase (banco de dados, login e arquivos) e Vercel (hospedagem do app). Se você usar, também Meta (WhatsApp) e Google/Apple (login). Com os outros membros da sua carteira, os dados dela. Com autoridades, só por ordem legal.</p>

        <h2>4. Segurança</h2>
        <p>Conexão criptografada (HTTPS), regras no banco que só deixam membros da carteira lerem os dados dela, senha guardada pelo provedor de login com hash, e verificação em duas etapas opcional.</p>

        <h2>5. Por quanto tempo</h2>
        <p>Enquanto a conta existir. O histórico de alterações da carteira guarda 400 dias; registros técnicos, até 90 dias. Ao excluir a conta, apagamos seus dados de login, foto e as carteiras em que você era o único membro, com os comprovantes. Em carteira compartilhada, os lançamentos ficam para os outros membros, sem seu nome.</p>

        <h2>6. Seus direitos</h2>
        <ul>
          <li><b>Acesso e portabilidade:</b> Configurações → Baixar backup (arquivo JSON com todos os dados da carteira).</li>
          <li><b>Correção:</b> edite direto no app.</li>
          <li><b>Exclusão:</b> Minha conta → Segurança e privacidade → Excluir conta.</li>
          <li><b>Revogar consentimento:</b> desligue notificações e WhatsApp em Configurações.</li>
          <li><b>Informações e reclamações:</b> fale conosco em {{ contato }}. Você também pode procurar a ANPD.</li>
        </ul>

        <h2>7. Armazenamento no aparelho</h2>
        <p>O app guarda preferências e uma fila de lançamentos sem internet no navegador (localStorage e IndexedDB). Não usamos cookies de rastreamento.</p>

        <h2>8. Crianças</h2>
        <p>O CFP não é destinado a menores de 18 anos.</p>

        <h2>9. Mudanças</h2>
        <p>Se esta política mudar, o app pede um novo aceite. Veja também os <a routerLink="/termos">Termos de uso</a>.</p>
      }
    </article>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 10px; line-height: 1.55; }
    h1 { margin: 8px 0 0; }
    h2 { font-size: 1.05rem; margin: 14px 0 0; }
    ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
    .voltar { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 0; color: var(--primary); font: inherit; font-weight: 700; cursor: pointer; }
  `,
})
export default class Legal {
  readonly doc = input<'termos' | 'privacidade'>('termos');
  protected versao = TERMOS_VERSAO.split('-').reverse().join('/');
  protected contato = CONTATO;

  voltar() {
    if (history.length > 1) history.back();
    else location.assign('/');
  }
}
