import { useCallback, useEffect, useState } from 'react';

function isApkWebViewShell(): boolean {
  return /OpenGraceMusicAPK\//i.test(navigator.userAgent || '');
}

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

    let regRef: ServiceWorkerRegistration | null = null;

    const activateWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateReady(true);
        window.dispatchEvent(new CustomEvent('ogm-sw-update-ready'));
        // APK WebView: auto-activate so site deploys show without tapping a toast.
        if (isApkWebViewShell()) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    };

    const checkForUpdate = () => {
      void regRef?.update().catch(() => {});
      if (regRef) activateWaiting(regRef);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        regRef = reg;
        setRegistration(reg);
        activateWaiting(reg);

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              activateWaiting(reg);
            }
          });
        });

        checkForUpdate();
      })
      .catch(() => {});

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkForUpdate);

    return () => {
      window.removeEventListener('ogm-sw-update-ready', onUpdateReady);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  return { updateReady, reloadForUpdate, dismissUpdate: () => setUpdateReady(false) };
}
