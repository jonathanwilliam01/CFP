/** absoluto: o tesseract carrega o worker por importScripts dentro de um blob, onde caminho relativo não resolve */
const BASE = `${location.origin}/ocr`;
/** módulo wasm mínimo com instrução SIMD (o mesmo teste do wasm-feature-detect) */
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const core = () => `${BASE}/core/tesseract-core${WebAssembly.validate(SIMD) ? '-simd' : ''}-lstm.wasm.js`;

/** Motor e português servidos pelo próprio app e guardados pelo service worker: depois da primeira vez lê sem internet */
export async function lerImagem(img: Blob | HTMLCanvasElement, progresso?: (p: number) => void) {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('por', 1, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: core(),
    langPath: `${BASE}/lang`,
    logger: (m: { status: string; progress: number }) => m.status === 'recognizing text' && progresso?.(m.progress),
  });
  try {
    return (await w.recognize(img)).data.text;
  } finally {
    await w.terminate();
  }
}

/** PDF com texto lê direto; escaneado vira imagem e passa pelo OCR (até 2 páginas) */
export async function lerPdf(arq: Blob, progresso?: (p: number) => void) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arq.arrayBuffer()) });
  const doc = await tarefa.promise;
  try {
    const paginas = Math.min(doc.numPages, 2);
    let texto = '';
    for (let i = 1; i <= paginas; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      texto += c.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('') + '\n';
    }
    if (texto.replace(/\s/g, '').length >= 20) return texto;
    texto = '';
    for (let i = 1; i <= paginas; i++) {
      const pag = await doc.getPage(i);
      const viewport = pag.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pag.render({ canvas, viewport }).promise;
      texto += (await lerImagem(canvas, (p) => progresso?.((i - 1 + p) / paginas))) + '\n';
    }
    return texto;
  } finally {
    await tarefa.destroy();
  }
}

/** Baixa o OCR em segundo plano uma vez por aparelho, para ler sem internet; respeita economia de dados */
export function prepararOcr() {
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || net?.saveData || /2g/.test(net?.effectiveType ?? '')) return;
  try {
    if (localStorage.getItem('cfp.ocr') === '1') return;
  } catch {
    return;
  }
  Promise.all([`${BASE}/worker.min.js`, core(), `${BASE}/lang/por.traineddata.gz`].map((u) => fetch(u).then((r) => (r.ok ? r.blob() : Promise.reject()))))
    .then(() => localStorage.setItem('cfp.ocr', '1'))
    .catch(() => undefined);
}
