// Service worker do app: recebe o compartilhamento com arquivo (share_target POST) e o resto fica com o do Angular.
// O arquivo e o texto vão para o IndexedDB (mesmo banco de core/arquivos.ts) e o app abre com ?compartilhado=1.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || url.pathname !== '/compartilhar') return;
  e.stopImmediatePropagation();
  e.respondWith(
    (async () => {
      const f = await e.request.formData();
      const texto = ['titulo', 'texto', 'link'].map((k) => f.get(k)).filter((v) => typeof v === 'string' && v).join('\n');
      const arquivo = f.getAll('arquivo').find((v) => typeof v !== 'string') ?? null;
      await guardar({ texto, arquivo });
      return Response.redirect('/?compartilhado=1', 303);
    })(),
  );
});

function guardar(v) {
  return new Promise((ok, falha) => {
    const r = indexedDB.open('cfp', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('arquivos');
    r.onerror = () => falha(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('arquivos', 'readwrite');
      tx.objectStore('arquivos').put(v, 'compartilhado');
      tx.oncomplete = () => (r.result.close(), ok());
      tx.onerror = () => falha(tx.error);
    };
  });
}

importScripts('./ngsw-worker.js');
