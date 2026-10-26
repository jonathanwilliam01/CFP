import { dataIso, lerExtrato, palpiteCategoria } from './extrato';
import { Categoria } from './models';

describe('lerExtrato', () => {
  it('fatura Nubank: ignora pagamento e separa a parcela', () => {
    const csv = 'date,title,amount\n2026-10-02,Padaria Real,12.50\n2026-10-03,Pagamento recebido,-500.00\n2026-10-04,Loja X - Parcela 2/5,100.00\n';
    const e = lerExtrato(csv);
    expect(e.origem).toBe('nubank');
    expect(e.ignorados).toBe(1);
    expect(e.itens).toHaveLength(2);
    expect(e.itens[1]).toMatchObject({ descricao: 'Loja X', parcela: 2, parcelas: 5, valor: 100 });
  });

  it('CSV de banco com ";" e saídas negativas', () => {
    const csv = 'Data;Descrição;Valor\n05/10/2026;Mercado Bom;-1.234,56\n06/10/2026;Pix recebido;300,00\n07/10/2026;Uber;-20,00\n';
    const e = lerExtrato(csv);
    expect(e.origem).toBe('csv');
    expect(e.itens.map((x) => [x.data, x.descricao, x.valor])).toEqual([
      ['2026-10-05', 'Mercado Bom', 1234.56],
      ['2026-10-07', 'Uber', 20],
    ]);
    expect(e.ignorados).toBe(1);
  });

  it('OFX de cartão em SGML', () => {
    const ofx = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-45.90<MEMO>Posto Shell
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261004<TRNAMT>200.00<MEMO>Pagamento
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const e = lerExtrato(ofx);
    expect(e.origem).toBe('ofx-cartao');
    expect(e.itens).toEqual([expect.objectContaining({ data: '2026-10-03', descricao: 'Posto Shell', valor: 45.9 })]);
    expect(e.ignorados).toBe(1);
  });

  it('OFX de conta em XML', () => {
    const ofx = '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261001</DTPOSTED><TRNAMT>-10.00</TRNAMT><NAME>Tarifa</NAME></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
    const e = lerExtrato(ofx);
    expect(e.origem).toBe('ofx-conta');
    expect(e.itens[0]).toMatchObject({ data: '2026-10-01', descricao: 'Tarifa', valor: 10 });
  });

  it('CSV sem colunas reconhecíveis dá erro', () => {
    expect(() => lerExtrato('a,b,c\n1,2,3')).toThrow();
  });
});

describe('dataIso', () => {
  it('aceita formatos comuns', () => {
    expect(dataIso('2026-10-05')).toBe('2026-10-05');
    expect(dataIso('5/10/26')).toBe('2026-10-05');
    expect(dataIso('xx')).toBe('');
  });
});

describe('palpiteCategoria', () => {
  it('acha a categoria pelo estabelecimento', () => {
    const cats = [{ id: 'g', nome: 'Gasolina' }, { id: 'm', nome: 'Mercado' }] as Categoria[];
    expect(palpiteCategoria('Posto Ipiranga', cats)).toBe('g');
    expect(palpiteCategoria('Supermercado Dia', cats)).toBe('m');
    expect(palpiteCategoria('Coisa', cats)).toBeNull();
  });
});
