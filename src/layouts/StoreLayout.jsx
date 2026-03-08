import { useMemo, useState } from 'react';
import {
  BadgePercent,
  Banknote,
  FileSpreadsheet,
  HandCoins,
  Home,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/shared/Sidebar';
import Topbar from '../components/shared/Topbar';

const pageTitles = {
  '/store/dashboard': 'الرئيسية',
  '/store/customers': 'العملاء',
  '/store/suppliers': 'الموردون',
  '/store/products': 'المنتجات',
  '/store/categories': 'التصنيفات',
  '/store/sales-invoices': 'فواتير البيع',
  '/store/purchase-invoices': 'فواتير الشراء',
  '/store/payments': 'المدفوعات',
  '/store/cash': 'الخزنة',
  '/store/inventory': 'المخزن',
  '/store/settings': 'إعدادات المتجر',
};

const getPageTitle = (pathname) => {
  if (pathname.startsWith('/store/customers/') && pathname.endsWith('/statement')) {
    return 'كشف حساب عميل';
  }

  if (pathname.startsWith('/store/suppliers/') && pathname.endsWith('/statement')) {
    return 'كشف حساب مورد';
  }

  if (pathname === '/store/purchase-invoices/create') {
    return 'إضافة فاتورة شراء';
  }

  if (pathname === '/store/sales-invoices/create') {
    return 'إنشاء فاتورة بيع';
  }

  if (pathname.startsWith('/store/purchase-invoices/')) {
    return 'تفاصيل فاتورة شراء';
  }

  return pageTitles[pathname] || 'لوحة المتجر';
};

export default function StoreLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const items = useMemo(
    () => [
      { label: 'الرئيسية', icon: Home, path: '/store/dashboard' },
      { label: 'العملاء', icon: Users, path: '/store/customers' },
      { label: 'الموردون', icon: Truck, path: '/store/suppliers' },
      { label: 'المنتجات', icon: Package, path: '/store/products' },
      { label: 'التصنيفات', icon: BadgePercent, path: '/store/categories' },
      { label: 'فواتير البيع', icon: FileSpreadsheet, path: '/store/sales-invoices' },
      { label: 'فواتير الشراء', icon: ShoppingCart, path: '/store/purchase-invoices' },
      { label: 'الخزنة', icon: Banknote, path: '/store/cash' },
      { label: 'المخزن', icon: Warehouse, path: '/store/inventory' },
    ],
    []
  );

  const footerItems = useMemo(() => [{ label: 'إعدادات المتجر', icon: Settings, path: '/store/settings' }], []);

  const title = getPageTitle(location.pathname);

  return (
    <div className="min-h-screen bg-bg lg:flex">
      <Sidebar
        items={items}
        footerItems={footerItems}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar title={title} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}