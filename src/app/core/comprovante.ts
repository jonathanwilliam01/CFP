import { reduzir } from './imagem';
import { q, supabase } from './supabase';

const BUCKET = 'comprovantes';
const MAX_PDF = 5 * 1024 * 1024;

export const ePdf = (caminho: string) => caminho.endsWith('.pdf');

/** Foto vira JPEG reduzido (legível); PDF vai como veio, até 5 MB */
export async function prepararComprovante(f: File): Promise<Blob> {
  if (f.type === 'application/pdf') {
    if (f.size > MAX_PDF) throw new Error('PDF maior que 5 MB');
    return f;
  }
  if (!f.type.startsWith('image/')) throw new Error('Envie uma foto ou um PDF');
  return reduzir(f, 1600);
}

/** Grava em <carteira>/<gasto>.jpg|pdf e devolve o caminho */
export async function enviarComprovante(carteira: string, gasto: string, arq: Blob) {
  const caminho = `${carteira}/${gasto}.${arq.type === 'application/pdf' ? 'pdf' : 'jpg'}`;
  await q(supabase.storage.from(BUCKET).upload(caminho, arq, { upsert: true, contentType: arq.type }));
  return caminho;
}

export const removerComprovante = (caminho: string) => q(supabase.storage.from(BUCKET).remove([caminho]));

/** Bucket privado: link que vale 1 hora */
export async function linkComprovante(caminho: string) {
  return (await q(supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600))).signedUrl;
}
