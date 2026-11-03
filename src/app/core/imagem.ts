/** Reduz para no máximo `lado` px no maior lado, em JPEG */
export async function reduzir(arquivo: Blob, lado: number): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k);
  cv.height = Math.round(img.height * k);
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
  img.close();
  return new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha()), 'image/jpeg', 0.85));
}
