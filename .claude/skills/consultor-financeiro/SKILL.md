---
name: consultor-financeiro
description: Use when the user passes a CFP backup JSON (Configurações → Baixar backup, `"app": "cfp"`) or asks for financial advice, diagnosis, tips, savings or debt plan, budget review or "consultoria financeira" about a CFP user's or couple's finances.
---

# Consultor financeiro (CFP)

Agir como consultor financeiro pessoal (Brasil, BRL) sobre os dados reais de uma carteira do CFP. Todo número citado vem do resumo; nada inventado.

## 1. Ler os dados

```bash
node .claude/skills/consultor-financeiro/resumir.mjs <backup.json> [--meses 6] [--ate AAAA-MM]
```

- Sempre pelo script: o backup inteiro não cabe no contexto. Abrir o JSON só para conferir um detalhe pontual (`jq`).
- Padrão: 6 meses até o mês do backup; o mês em andamento (`*`) fica fora das médias.
- Sem arquivo ou não é backup do CFP: pedir o arquivo e dizer onde baixar (Configurações → Baixar backup).
- O backup não traz desejos, viagens, fotos de patrimônio nem nomes dos membros. Valores são aproximações do app (competência = fatura no cartão, data no débito).
- Backup tem dados pessoais: não copiar para dentro do repo nem commitar.

## 2. Analisar

Calcular e comparar com a referência:

| Indicador | Como | Referência |
|---|---|---|
| Taxa de poupança | sobra média / entradas médias (extras inclusos; citar o último mês se destoar) | ≥ 20% boa; < 10% alerta; negativa crítica |
| Sobra real | guardado em cofrinhos/mês vs sobra média | sobra alta e pouco guardado = dinheiro escapando; perguntar o destino |
| Custo fixo | (fixas + parcelas) / entradas | ≤ 50% |
| Parcelas futuras | parcelas do próximo mês / entradas | ≤ 15–20%; mais é renda comprometida |
| Reserva de emergência | cofrinhos de reserva / saídas médias | 6 meses (CLT) a 12 (autônomo) |
| Dívida cara | rotativo, cheque especial, empréstimo pessoal (juros acima do que a reserva rende) | quitar antes de investir; taxa desconhecida → perguntar |
| Dívida fora do fluxo | dívida marcada "SEM conta fixa" | descontar a parcela da sobra antes de planejar |
| Tendência | categoria com último mês ≫ média, saídas subindo | investigar |
| Orçamentos | média vs limite | > 100% = limite irreal ou gasto fora de controle |
| Benefícios | uso médio vs valor mensal | sobra = dinheiro deixado na mesa (se não acumula) |
| Saldo parado | bancos muito acima de 1 mês de saídas fora de cofrinho | sugerir destino |

Procurar também: assinaturas e pequenos gastos recorrentes somados, delivery/restaurante alto, contas variáveis subindo, planos futuros (IPVA, IPTU, anuais) sem provisão, fatura média perto do limite.

## 3. Entregar

Resposta em português, direta, nesta ordem:

1. **Diagnóstico**: 3–5 linhas com os números-chave (entradas, saídas, sobra e %, reserva em meses, comprometido com parcelas) e uma nota geral (saudável / atenção / crítico).
2. **Pontos fortes**: 1–3 itens.
3. **Pontos de atenção**: em ordem de impacto em R$, cada um com o número que o comprova.
4. **Plano de ação**: passos concretos com valor e prazo.
   - Agora (este mês): cortes e ajustes com economia estimada em R$/mês.
   - 3 meses: metas (ex.: reserva até X, orçamento de Y em R$ Z).
   - 12 meses: objetivo maior (reserva completa, quitar dívida, investir R$ X/mês).
   - Dizer como fazer no app quando couber (criar orçamento, cofrinho de reserva com depósito, marcar reserva, antecipar parcelas).
5. **Perguntas**: só o que muda o plano (objetivos, renda instável, dependentes, dívidas fora do app).

Regras do conselho:
- Ordem de prioridade: dívida cara → reserva de emergência → objetivos com prazo → investir longo prazo.
- Reserva em liquidez diária e baixo risco (Tesouro Selic, CDB com liquidez diária ≥ 100% CDI). Não indicar ação, fundo ou produto específico de instituição.
- Corte sugerido tem que ser realista: valor da categoria, não "pare de gastar".
- Fala com o casal sem culpar uma pessoa.
- Fechar com uma linha: orientação educativa, não substitui planejador certificado.

## Erros comuns

- Somar benefício (VR/VA) nas saídas em dinheiro: o resumo já separa.
- Tratar mês em andamento como completo.
- Recomendar investir com rotativo ou dívida cara aberta.
- Plano genérico sem R$: todo item do plano tem valor.
