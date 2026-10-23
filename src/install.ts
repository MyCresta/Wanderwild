// Chrome's install prompt event; not yet in the DOM typings.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const IOS_TIP_KEY = 'wanderwild.iosInstallTipShown';

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Offers "Install Wanderwild" where the browser supports an install prompt (Android
 * Chrome, desktop Chrome and Edge), and a one-time Add to Home Screen tip on iOS.
 */
export function setupInstallButton(button: HTMLButtonElement, showNotice: (text: string | null) => void): void {
  if (isStandalone()) return;

  let deferred: BeforeInstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    button.hidden = false;
  });

  button.addEventListener('click', async () => {
    if (!deferred) return;
    button.hidden = true;
    await deferred.prompt();
    deferred = null;
  });

  window.addEventListener('appinstalled', () => {
    button.hidden = true;
    deferred = null;
  });

  // iOS Safari has no install prompt, so explain the manual steps once.
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIos) return;
  try {
    if (localStorage.getItem(IOS_TIP_KEY)) return;
    localStorage.setItem(IOS_TIP_KEY, '1');
  } catch {
    // Without storage the tip would show every visit; skip it instead.
    return;
  }
  showNotice('To install, tap Share, then "Add to Home Screen".');
  setTimeout(() => showNotice(null), 10_000);
}
