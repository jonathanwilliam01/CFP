import { lerTags, lerTexto } from './texto';
import { Beneficio, Cartao, Categoria } from './models';

const cartoes = [
  { id: 'nu', nome: 'Nubank', ativo: true },
  { id: 'it', nome: 'Banco Inter', ativo: true },
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

describe('lerTags', () => {
  it('normaliza e remove repetidos', () => {
    expect(lerTags('#Viagem, praia viagem;Reforma')).toEqual(['viagem', 'praia', 'reforma']);
  });
});
