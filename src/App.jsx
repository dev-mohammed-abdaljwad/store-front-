import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/auth/LoginPage';
import ProtectedRoute from './components/shared/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import StoreLayout from './layouts/StoreLayout';
import CustomersPage from './pages/store/customers/CustomersPage';
import CustomerStatement from './pages/store/customers/CustomerStatement';
import SuppliersPage from './pages/store/suppliers/SuppliersPage';
import SupplierStatement from './pages/store/suppliers/SupplierStatement';
import ProductsPage from './pages/store/products/ProductsPage';
import CategoriesPage from './pages/store/products/CategoriesPage';
import SalesInvoicesPage from './pages/store/sales/SalesInvoicesPage';
import CreateSalesInvoice from './pages/store/sales/CreateSalesInvoice';
import PurchaseInvoicesPage from './pages/store/purchase-invoices/PurchaseInvoicesPage';
import CreatePurchaseInvoicePage from './pages/store/purchase-invoices/CreatePurchaseInvoicePage';
import PurchaseInvoiceDetailsPage from './pages/store/purchase-invoices/PurchaseInvoiceDetailsPage';
import PaymentsPage from './pages/store/payments/PaymentsPage';
import CashPage from './pages/store/cash/CashPage';
import StoreDashboardPage from './pages/store/dashboard/StoreDashboardPage';
import StoreSettings from './pages/store/settings/StoreSettings';
import AdminDashboard from './pages/admin/AdminDashboard';
import PWAInstallPrompt from './components/shared/PWAInstallPrompt';

export default function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/admin" element={<ProtectedRoute role="super_admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="stores" element={<AdminDashboard />} />
            </Route>
          </Route>

          <Route path="/store" element={<ProtectedRoute role="store_owner" />}>
            <Route element={<StoreLayout />}>
              <Route path="dashboard" element={<StoreDashboardPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id/statement" element={<CustomerStatement />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="suppliers/:id/statement" element={<SupplierStatement />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="sales-invoices" element={<SalesInvoicesPage />} />
              <Route path="sales-invoices/create" element={<CreateSalesInvoice />} />
              <Route path="purchase-invoices" element={<PurchaseInvoicesPage />} />
              <Route path="purchase-invoices/create" element={<CreatePurchaseInvoicePage />} />
              <Route path="purchase-invoices/:id" element={<PurchaseInvoiceDetailsPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="cash" element={<CashPage />} />
              <Route path="settings" element={<StoreSettings />} />
              <Route path="*" element={<Navigate to="/store/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>

        <Toaster position="top-center" />
      </BrowserRouter>

      <PWAInstallPrompt />
    </>
  );
}