import { useCallback, useEffect, useState } from 'react';

export function useServiceWorkerUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const reloadForUpdate = useCallback(() => {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }, [registration]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onUpdateReady = () => setUpdateReady(true);

    window.addEventListener('ogm-sw-update-ready', onUpdateReady);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OGM_SW_ACTIVATED') {
        setUpdateReady(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        setRegistration(reg);

        if (reg.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setUpdateReady(true);
              window.dispatchEvent(new CustomEvent('ogm-sw-update-ready'));
            }
          });
        });
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('ogm-sw-update-ready', onUpdateReady);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return { updateReady, reloadForUpdate, dismissUpdate: () => setUpdateReady(false) };
}
