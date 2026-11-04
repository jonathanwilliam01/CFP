/** Texto de uma foto (comprovante, cupom) lido no próprio aparelho; o motor e o português baixam na primeira vez */
export async function lerImagem(img: Blob, progresso?: (p: number) => void) {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('por', 1, { logger: (m: { status: string; progress: number }) => m.status === 'recognizing text' && progresso?.(m.progress) });
  try {
    return (await w.recognize(img)).data.text;
  } finally {
    await w.terminate();
  }
}
