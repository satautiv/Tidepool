/**
 * Registers the service worker on PWA builds (T3.08) and handles updates politely: a new
 * version installs in the background, and only a tap on the "New version" toast activates it
 * and reloads (the run is saved, so it can be continued).
 */

export interface UpdatePrompt {
  showAction(text: string, action: string, onTap: () => void): void;
}

export interface PwaEnv {
  serviceWorker?: ServiceWorkerContainer;
  reload(): void;
}

export async function registerServiceWorker(
  prompt: UpdatePrompt,
  text: { update: string; action: string },
  env: PwaEnv = { serviceWorker: navigator.serviceWorker, reload: () => location.reload() },
): Promise<ServiceWorkerRegistration | null> {
  const sw = env.serviceWorker;
  if (!sw) return null;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    env.reload();
  });
  const offer = (worker: ServiceWorker) =>
    prompt.showAction(text.update, text.action, () => worker.postMessage('skipWaiting'));

  try {
    const reg = await sw.register('sw.js');
    // An update that finished installing while the game was closed.
    if (reg.waiting && sw.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        // Only an update: the very first install needs no prompt.
        if (worker.state === 'installed' && sw.controller) offer(worker);
      });
    });
    return reg;
  } catch {
    return null; // offline support is a bonus; never break the game over it
  }
}
