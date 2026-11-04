// Link de convite: /?convite=CODIGO guarda o código até a pessoa entrar e chegar na tela de carteira
const CHAVE = 'cfp.convite';

export const linkConvite = (codigo: string) => `${location.origin}/?convite=${codigo}`;

export function guardarConvite() {
  const c = new URLSearchParams(location.search).get('convite')?.trim().toUpperCase();
  if (c && /^[A-Z0-9]{6,12}$/.test(c)) {
    try {
      localStorage.setItem(CHAVE, c);
    } catch {}
  }
}

export function conviteGuardado() {
  try {
    return localStorage.getItem(CHAVE) ?? '';
  } catch {
    return '';
  }
}

export function limparConvite() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {}
}
