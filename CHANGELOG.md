# Changelog

## v1.26.10.5 — 2026-10-28
- Logo CFP sai da barra superior; menu lateral com a sigla e o nome completo no topo e o botão Lançamento logo abaixo
- Lançamento com "Repete todo mês": vira conta fixa ou entrada fixa (valor variável, salário do mês anterior e data final opcionais)
- Reajuste de valor de contas e entradas fixas a partir de um mês, também nas variáveis (a média volta a contar dali); contas encerradas ficam escondidas
- Lançamento abre no último tipo usado; segurar o + escolhe Gasto, Parcelado, Entrada ou Conta fixa
- Atalho N no computador para novo lançamento
- Menu recolhido mostra o nome do item ao passar o mouse
- Escolha da cor principal (azul, vermelho, verde, laranja ou roxo) em Configurações, nos temas claro e escuro
- Saldo do mês em verde (positivo) ou vermelho (negativo), entradas em verde e saídas em vermelho, em qualquer cor principal
- Excluir com "Desfazer" por 5 segundos no lugar da confirmação
- Mensagens novas do chat aparecem nas notificações
- Reajuste feito numa única operação no banco e com histórico de valores na edição da conta (migration 018)
- "Repete todo mês" com data de hoje ou anterior já marca o primeiro mês como pago ou recebido
- Lançamento sem internet fica guardado no aparelho e é enviado quando a conexão volta
- "Lançar de novo hoje" na edição de um gasto ou entrada
- "Desfazer" também ao marcar conta paga ou entrada recebida
- Card do saldo compara os gastos com o mês anterior e alterna entre só dinheiro e com benefícios
- Aviso quando uma conta variável vem 30% ou mais acima da média

## v1.26.10.4 — 2026-10-27
- Foto dos membros na carteira e no chat; toque para ver em tela cheia
- Contas por recebimento: quanto de conta cai em cada dia de recebimento (ex.: vale dia 20 e salário dia 7), quanto falta pagar e quanto sobra

## v1.26.10.3 — 2026-10-26
- Categoria padrão Gasolina
- Resumo mensal com entradas e gastos somando os benefícios (VR/VA), sem mudar o saldo em dinheiro
- Segurança da carteira: só o dono troca o código, remove membros e exclui a carteira; código de convite com 8 caracteres e limite de tentativas
- Sair da carteira, remover membro, excluir carteira e gerar novo código de convite
- Tela para definir a nova senha pelo link de "Esqueci minha senha"
- Importação de CSV de outros bancos e OFX, no cartão ou como Pix/Débito, numa única transação
- Avisos com o app fechado (Web Push) para chat e contas vencendo
- Alterações do parceiro em cartões, categorias, benefícios, orçamentos, cofrinhos e exclusões aparecem na hora
- Correção: entrada fixa recebida no mês seguinte aparecia como recebida no mês atual
- Correção: compra parcelada pelo valor total perdia centavos; a última parcela leva a diferença
- Correção: trocar de mês rápido podia mostrar dados do mês anterior
- Correção: parcela excluída continuava contando em Parcelamentos

## v1.26.10.2 — 2026-10-26
- Chat entre os membros da carteira, com aviso de mensagem nova
- Importação da fatura do Nubank (CSV) com categoria sugerida, parcelas e aviso de gasto já lançado
- Voltar do celular fecha o painel aberto (lançamento, edição, foto) em vez de sair da página
- Conta fixa com opção de pagar com o salário do mês anterior ao vencimento
- Conta fixa paga com benefício: desconta do saldo dele e não entra nas saídas do mês

## v1.26.10.1 — 2026-10-26
- Primeira versão do CFP
- Lançamento rápido de gastos, entradas e compras parceladas
- Cartões com fechamento, vencimento, cartão padrão e fatura nas contas do mês
- Compras no crédito do mês por cartão, com a fatura em que cada uma cai
- Opção no cartão para pagar a fatura com o salário do mês anterior ao vencimento
- Contas fixas e entradas fixas (salário) com baixa mensal
- Contas fixas cobradas no cartão: entram na fatura aberta, vencem com ela e são pagas junto
- Contas de valor variável (ex.: luz) com previsão pela média das últimas contas
- Benefícios (VR/VA) descontados sem entrar nas contas do mês
- Cofrinhos com meta, histórico e percentual
- Orçamentos por categoria com bandeiras vermelhas
- Planejamento dos próximos meses, relatórios e resumo mensal
- Registros avulsos (ex.: gastos com o carro) fora das contas do mês
- Notificações, dicas e carteira compartilhada por código de convite
- Tema claro/escuro/automático
- Desktop com menu lateral recolhível e acesso à conta do usuário no topo
- Foto de perfil com visualização e ajuste de enquadramento (zoom e posição)
- Instalável no celular como "Controle Financeiro"
