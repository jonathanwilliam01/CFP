import { signal } from '@angular/core';

/** Extrato CSV/OFX solto na janela ou compartilhado: Importar lê ao abrir */
export const extratoPendente = signal<File | null>(null);
export const eExtrato = (f: File) => /\.(csv|ofx)$/i.test(f.name);

/** Arquivos guardados no aparelho (IndexedDB) até a internet voltar, pela chave do lançamento */
const abrir = () =>
  new Promise<IDBDatabase>((ok, falha) => {
    const r = indexedDB.open('cfp', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('arquivos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

async function exec<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await abrir();
  return new Promise<T>((ok, falha) => {
    const r = f(db.transaction('arquivos', modo).objectStore('arquivos'));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  }).finally(() => db.close());
}

export const guardarArquivo = (id: string, b: Blob) => exec('readwrite', (s) => s.put(b, id));
export const lerArquivo = (id: string) => exec<Blob | undefined>('readonly', (s) => s.get(id));
/** Deixado pelo sw.js ao compartilhar com o app; lido uma vez */
export async function tirarCompartilhado() {
  const v = await exec<{ texto: string; arquivo: File | null } | undefined>('readonly', (s) => s.get('compartilhado'));
  await apagarArquivo('compartilhado');
  return v ?? null;
}

export const apagarArquivo = (id: string) => exec('readwrite', (s) => s.delete(id));
