import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-lg">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Download size={24} className="text-primary" />
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold text-text">تثبيت التطبيق</p>
          <p className="text-xs text-text-muted">أضف التطبيق لشاشتك الرئيسية للوصول السريع</p>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={handleInstall}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark"
          >
            تثبيت
          </button>
          <button
            onClick={() => setShowPrompt(false)}
            className="flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs text-text-muted hover:bg-slate-100"
          >
            <X size={12} />
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  );
}
