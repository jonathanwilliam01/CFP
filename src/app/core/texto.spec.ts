import { lerComprovante, lerCupom, lerNotificacao, lerTags, lerTexto, regraPara } from './texto';
import { Beneficio, Cartao, Categoria } from './models';

const cartoes = [
  { id: 'nu', nome: 'Nubank', ativo: true },
  { id: 'it', nome: 'Banco Inter', ativo: true },
  { id: 'c6', nome: 'C6', ativo: true, padrao: true },
  { id: 'ms', nome: 'Mastercard Santander', ativo: true },
] as Cartao[];
const beneficios = [{ id: 'vr', nome: 'VR', ativo: true }] as Beneficio[];
const categorias = [
  { id: 'm', nome: 'Mercado', tipo: 'gasto' },
  { id: 'f', nome: 'Farmácia', tipo: 'gasto' },
] as Categoria[];
const ctx = { cartoes, beneficios, categorias, hoje: '2026-10-29' };

describe('lerTexto', () => {
  it('separa valor, cartão, data e marcador', () => {
    const r = lerTexto('mercado 120,50 nubank ontem #casa', ctx);
    expect(r).toEqual({ valor: 120.5, descricao: 'Mercado', data: '2026-10-28', pagamento: 'nu', categoria_id: 'm', parcelas: null, tags: ['casa'] });
  });

  it('parcelas, valor com milhar e preposição solta', () => {
    const r = lerTexto('TV sala 1.234,56 10x no inter', ctx);
    expect(r.valor).toBe(1234.56);
    expect(r.parcelas).toBe(10);
    expect(r.pagamento).toBe('it');
    expect(r.descricao).toBe('TV sala');
  });

  it('data dd/mm, pix e benefício', () => {
    expect(lerTexto('remédio farmácia 30 pix 05/10', ctx)).toMatchObject({ data: '2026-10-05', pagamento: 'debito', categoria_id: 'f', valor: 30 });
    expect(lerTexto('almoço 32 vr', ctx).pagamento).toBe('b:vr');
  });

  it('sem valor nem pagamento', () => {
    expect(lerTexto('padaria', ctx)).toMatchObject({ valor: null, pagamento: null, descricao: 'Padaria' });
  });
});

describe('lerTexto falado', () => {
  const le = (t: string) => lerTexto(t, ctx);

  it('qualquer ordem, verbo e preposições somem', () => {
    for (const t of ['gastei 50 reais no mercado com o nubank', 'no nubank 50 reais de mercado', 'mercado 50 reais nubank', 'paguei no cartão do nubank R$ 50 no mercado']) {
      expect(le(t)).toMatchObject({ valor: 50, descricao: 'Mercado', pagamento: 'nu', categoria_id: 'm' });
    }
  });

  it('número por extenso e centavos', () => {
    expect(le('cento e vinte reais e cinquenta centavos uber').valor).toBe(120.5);
    expect(le('uber doze e cinquenta').valor).toBe(12.5);
    expect(le('padaria vinte com cinquenta').valor).toBe(20.5);
    expect(le('dois mil e quinhentos reais geladeira').valor).toBe(2500);
    expect(le('uma pizza 45')).toMatchObject({ valor: 45, descricao: 'Pizza' });
    expect(le('2 pizzas por 80 reais')).toMatchObject({ valor: 80, descricao: '2 pizzas' });
  });

  it('parcelas e datas faladas', () => {
    expect(le('tv 1200 em dez vezes no inter')).toMatchObject({ parcelas: 10, pagamento: 'it', descricao: 'Tv', valor: 1200 });
    expect(le('parcelado em 3 celular 900').parcelas).toBe(3);
    expect(le('farmácia 30 dia 5').data).toBe('2026-10-05');
    expect(le('farmácia 30 dia cinco de setembro').data).toBe('2026-09-05');
    expect(le('almoço 40 na sexta').data).toBe('2026-10-23');
    expect(le('almoço 40 quinta-feira passada').data).toBe('2026-10-22');
  });

  it('nome do cartão com várias palavras, junto ou parecido', () => {
    expect(le('mercado 80 no banco inter').pagamento).toBe('it');
    expect(le('mercado 80 nu bank').pagamento).toBe('nu');
    expect(le('mercado 80 new bank').pagamento).toBe('nu');
    expect(le('mercado 80 no c6').pagamento).toBe('c6');
    expect(le('mercado 80 no santander').pagamento).toBe('ms');
    expect(le('mercado 80 no crédito').pagamento).toBe('c6');
    expect(le('mercado 80 no débito').pagamento).toBe('debito');
    expect(lerTexto('mercado 200 mercado pago', { ...ctx, cartoes: [...cartoes, { id: 'mp', nome: 'Mercado Pago', ativo: true } as Cartao] })).toMatchObject({ pagamento: 'mp', descricao: 'Mercado' });
    expect(lerTexto('mercado 200', { ...ctx, cartoes: [{ id: 'mp', nome: 'Mercado Pago', ativo: true } as Cartao] })).toMatchObject({ pagamento: null, descricao: 'Mercado' });
  });
});

describe('lerTexto com dois cartões do mesmo banco', () => {
  const dois = { ...ctx, cartoes: [{ id: 'joi', nome: 'Nubank Joi', ativo: true }, { id: 'elly', nome: 'Nubank Elly', ativo: true, padrao: true }] as Cartao[] };
  const pg = (t: string) => lerTexto(t, dois).pagamento;

  it('nome inteiro, só o apelido ou como o reconhecedor escreve', () => {
    for (const t of ['mercado 50 no nubank joi', 'mercado 50 no nubank joy', 'no joi 50 mercado', 'mercado 50 nu bank joi']) expect(pg(t)).toBe('joi');
    for (const t of ['mercado 50 no nubank elly', 'mercado 50 nubank eli', 'mercado 50 no Nubank Ely', 'mercado 50 nubank Ellie', 'mercado 50 nubank Elie', 'mercado 50 no elly', 'mercado 50 no eli'])
      expect(pg(t)).toBe('elly');
    expect(pg('foi 50 no mercado')).toBeNull();
    expect(lerTexto('gastei 50 no mercado no nubank joi', dois).descricao).toBe('Mercado');
  });

  it('só "nubank": fica o padrão', () => {
    expect(pg('mercado 50 nubank')).toBe('elly');
  });
});

describe('lerNotificacao', () => {
  const cs = [{ id: 'joi', nome: 'Nubank Joi', ativo: true, final: '1111' }, { id: 'elly', nome: 'Nubank Elly', ativo: true, padrao: true, final: '2222' }] as Cartao[];
  const le = (t: string) => {
    const n = lerNotificacao(t, cs);
    return n && lerTexto(n, { ...ctx, cartoes: cs, hoje: '2026-11-14' });
  };

  it('compra no cartão: loja, valor, data e cartão pelo final', () => {
    expect(le('Compra de R$ 50,00 APROVADA em MERCADO EXTRA para o cartão com final 1111.')).toMatchObject({ valor: 50, descricao: 'Mercado Extra', pagamento: 'joi' });
    expect(le('ITAU: Compra aprovada no cartao final 2222: R$ 89,90 em NETFLIX.COM 13/11 22h10')).toMatchObject({ valor: 89.9, descricao: 'Netflix', data: '2026-11-13', pagamento: 'elly' });
    expect(le('Compra aprovada no seu cartão final 9999 de R$ 120,00 em 14/11 às 10:20, POSTO IPIRANGA.')).toMatchObject({ valor: 120, descricao: 'Posto Ipiranga', data: '2026-11-14' });
    expect(le('BRADESCO CARTOES: COMPRA APROVADA NO CARTAO FINAL 1234 DE R$ 50,00 EM 14/11/2026 10:20 MP*MERCADOLIVRE.')).toMatchObject({ descricao: 'Mercadolivre', pagamento: null });
    expect(le('Nubank: Compra de R$ 33,00 aprovada em IFOOD *IFOOD')).toMatchObject({ valor: 33, descricao: 'Ifood', pagamento: 'elly' });
  });

  it('pix e débito', () => {
    expect(le('Você enviou um Pix de R$ 80,00 para JOAO PEDRO SANTOS.')).toMatchObject({ valor: 80, descricao: 'Joao Pedro Santos', pagamento: 'debito' });
    expect(le('Transferência enviada R$ 300,00 para Fulano de Tal via Pix')).toMatchObject({ descricao: 'Fulano de Tal', pagamento: 'debito' });
    expect(le('Compra no débito aprovada: R$ 15,00 em PADARIA SOL')).toMatchObject({ descricao: 'Padaria Sol', pagamento: 'debito' });
  });

  it('texto comum não é notificação', () => {
    expect(lerNotificacao('mercado 50 nubank')).toBeNull();
    expect(lerNotificacao('compra mercado r$ 50')).toBeNull();
  });
});

describe('lerTags', () => {
  it('normaliza e remove repetidos', () => {
    expect(lerTags('#Viagem, praia viagem;Reforma')).toEqual(['viagem', 'praia', 'reforma']);
  });
});

describe('lerComprovante', () => {
  it('Pix com rótulo e nome na linha seguinte', () => {
    const t = 'Comprovante de transferência\n23 OUT 2026 - 14:32:10\nValor\nR$ 1.250,00\nTipo de transferência\nPix\nDestino\nNome\nMaria da Silva\nCPF ***.123.456-**';
    expect(lerComprovante(t)).toBe('1.250,00 23/10/2026 pix Maria da Silva');
  });
  it('rótulo e nome na mesma linha', () => {
    expect(lerComprovante('Pagamento efetuado\nData: 05/11/2026\nValor: R$ 89,90\nPara: Padaria Central')).toBe('89,90 05/11/2026 Padaria Central');
  });
  it('sem valor devolve null', () => {
    expect(lerComprovante('mercado 120 nubank')).toBeNull();
  });
});

describe('regraPara', () => {
  it('acha o termo na descrição, sem acento, e o mais longo vence', () => {
    const regras = [{ termo: 'uber' }, { termo: 'uber eats' }, { termo: 'padaria' }];
    expect(regraPara('UBER EATS *pedido', regras)?.termo).toBe('uber eats');
    expect(regraPara('Uber trip', regras)?.termo).toBe('uber');
    expect(regraPara('Pádaria do Zé', regras)?.termo).toBe('padaria');
    expect(regraPara('mercado', regras)).toBeUndefined();
  });
});

describe('lerCupom', () => {
  it('cupom fiscal: total (sem subtotal e tributos), data e loja', () => {
    const t = 'SUPERMERCADO BOM PRECO LTDA\nCNPJ 12.345.678/0001-90\nARROZ 5KG 24,90\nSUBTOTAL 49,80\nDESCONTO 1,00\nTOTAL R$ 48,80\nVal aprox tributos 9,10\n30/11/26 18:22';
    expect(lerCupom(t)).toBe('48,80 30/11/2026 SUPERMERCADO BOM PRECO LTDA');
  });
  it('total com o número na linha de baixo', () => {
    expect(lerCupom('PADARIA SOL\nVALOR TOTAL\n12,50')).toBe('12,50 PADARIA SOL');
  });
  it('sem total: null', () => {
    expect(lerCupom('foto qualquer')).toBeNull();
  });
});
