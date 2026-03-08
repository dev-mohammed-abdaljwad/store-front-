import { LogOut, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

export default function Sidebar({ items, footerItems = [], isOpen = true, onClose }) {
  const logout = useAuthStore((state) => state.logout);
  const store = useAuthStore((state) => state.store);

  const storeName = store?.name || 'المتجر';
  const storeInitial = String(store?.name || '').trim().charAt(0) || '🌿';

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed right-0 top-0 z-40 flex h-screen w-[240px] flex-col bg-secondary text-white transition-transform lg:static lg:z-10 lg:translate-x-0',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2 text-lg font-bold">
            {store?.logo_url ? (
              <img src={store.logo_url} alt="شعار المتجر" className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-700 text-lg font-bold text-white">
                {storeInitial}
              </div>
            )}
            <span className="max-w-[140px] truncate text-sm font-semibold">{storeName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors',
                    isActive ? 'bg-primary' : 'hover:bg-white/10'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {footerItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors',
                    isActive ? 'bg-primary' : 'hover:bg-white/10'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20"
          >
            <LogOut className="h-4 w-4 text-red-400" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}