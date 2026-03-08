import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileSpreadsheet, FileText, Package, Search, Warehouse, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getInventory } from '../../../api/inventory';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import StatsCard from '../../../components/shared/StatsCard';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency } from '../../../utils/formatters';

const extractInventoryItems = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
};

const normalizeStatus = (status) => {
  if (status === 'out' || status === 'low' || status === 'available') return status;
  return 'available';
};

const normalizeItem = (item) => {
  const purchasePrice = Number(item?.purchase_price) || 0;
  const salePrice = Number(item?.sale_price) || 0;
  const currentStock = Number(item?.current_stock) || 0;

  return {
    variant_id: Number(item?.variant_id) || 0,
    product_name: item?.product_name || '—',
    variant_name: item?.variant_name || '—',
    supplier_name: item?.supplier_name || '—',
    category: item?.category || '—',
    sale_price: salePrice,
    purchase_price: purchasePrice,
    current_stock: currentStock,
    status: normalizeStatus(item?.status),
  };
};

const getStatusLabel = (status) => {
  if (status === 'low') return 'منخفض';
  if (status === 'out') return 'نافد';
  return 'متاح';
};

const getStatusBadge = (status) => {
  if (status === 'low') {
    return 'bg-amber-100 text-amber-700';
  }
  if (status === 'out') {
    return 'bg-red-100 text-red-700';
  }
  return 'bg-green-100 text-green-700';
};

export default function InventoryPage() {
  const store = useAuthStore((state) => state.store);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const inventoryQuery = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => extractInventoryItems(await getInventory()),
    staleTime: 5 * 60 * 1000,
  });

  const inventory = useMemo(() => {
    const source = Array.isArray(inventoryQuery.data) ? inventoryQuery.data : [];
    return source.map(normalizeItem);
  }, [inventoryQuery.data]);

  const categories = useMemo(() => {
    const set = new Set(inventory.map((item) => item.category || '—'));
    return Array.from(set);
  }, [inventory]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim();

    return inventory.filter((item) => {
      const matchSearch =
        !normalizedSearch ||
        item.product_name.includes(normalizedSearch) ||
        item.variant_name.includes(normalizedSearch) ||
        item.supplier_name.includes(normalizedSearch);

      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [inventory, search, categoryFilter, statusFilter]);

  const totalVariants = inventory.length;
  const lowStock = inventory.filter((item) => item.status === 'low').length;
  const outOfStock = inventory.filter((item) => item.status === 'out').length;
  const totalValueCost = inventory.reduce((sum, item) => sum + item.purchase_price * item.current_stock, 0);
  const totalValueSale = inventory.reduce((sum, item) => sum + item.sale_price * item.current_stock, 0);

  const filteredTotalQty = filtered.reduce((sum, item) => sum + item.current_stock, 0);
  const filteredCostValue = filtered.reduce((sum, item) => sum + item.purchase_price * item.current_stock, 0);
  const filteredSaleValue = filtered.reduce((sum, item) => sum + item.sale_price * item.current_stock, 0);

  const lastUpdateText = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePrintPDF = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const rows = filtered.map((item, index) => ({
      '#': index + 1,
      المنتج: item.product_name,
      الحجم: item.variant_name,
      المورد: item.supplier_name,
      التصنيف: item.category,
      'سعر الشراء': item.purchase_price,
      'سعر البيع': item.sale_price,
      الكمية: item.current_stock,
      'قيمة المخزن': item.purchase_price * item.current_stock,
      الحالة: getStatusLabel(item.status),
    }));

    rows.push({
      '#': '',
      المنتج: 'الإجمالي',
      الحجم: '',
      المورد: '',
      التصنيف: '',
      'سعر الشراء': '',
      'سعر البيع': '',
      الكمية: filteredTotalQty,
      'قيمة المخزن': filteredCostValue,
      الحالة: '',
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();

    ws['!cols'] = [
      { wch: 5 },
      { wch: 20 },
      { wch: 15 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'تقرير المخزن');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `inventory-${date}.xlsx`);
  };

  if (inventoryQuery.isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      <style>
        {`@media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-family: Cairo, sans-serif; direction: rtl; background: #fff !important; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; }
          thead { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .inventory-row-low { background: #fffbeb !important; }
          .inventory-row-out { background: #fef2f2 !important; }
        }`}
      </style>

      <PageHeader
        title="المخزن"
        subtitle={`آخر تحديث: ${lastUpdateText}`}
        actions={
          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-2 rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPDF}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <FileText className="h-4 w-4" />
              <span>طباعة PDF</span>
            </button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 no-print">
        <StatsCard title="إجمالي الأصناف" value={totalVariants.toLocaleString('ar-EG')} icon={Package} color="blue" />
        <StatsCard title="مخزون منخفض" value={lowStock.toLocaleString('ar-EG')} icon={AlertTriangle} color="amber" />
        <StatsCard title="نافد" value={outOfStock.toLocaleString('ar-EG')} icon={XCircle} color="red" />
        <StatsCard
          title="قيمة المخزن"
          value={formatCurrency(totalValueCost)}
          icon={Warehouse}
          color="green"
          subtitle={`بسعر البيع: ${formatCurrency(totalValueSale)}`}
        />
      </div>

      <div className="no-print flex flex-wrap gap-3 rounded-xl border border-border bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالمنتج أو المورد..."
            className="h-10 w-full rounded-lg border border-border pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-10 rounded-lg border border-border px-3 text-sm"
        >
          <option value="all">كل التصنيفات</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {[
            { value: 'all', label: 'الكل', color: '' },
            { value: 'available', label: '✅ متاح', color: 'text-green-600' },
            { value: 'low', label: '⚠️ منخفض', color: 'text-amber-600' },
            { value: 'out', label: '❌ نافد', color: 'text-red-600' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`border-r border-border px-3 py-2 text-sm last:border-0 ${
                statusFilter === tab.value ? 'bg-primary text-white' : `bg-white ${tab.color} hover:bg-slate-50`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="print-only mb-6 hidden text-center">
        <h1 className="text-xl font-bold">{store?.name || 'المتجر'} - تقرير المخزن</h1>
        <p className="text-sm text-gray-500">تاريخ الجرد: {lastUpdateText}</p>
        <p className="text-sm">إجمالي الأصناف: {filtered.length}</p>
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">#</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">المنتج</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">الحجم</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">المورد</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">التصنيف</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">سعر الشراء</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">سعر البيع</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">الكمية</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">قيمة المخزن</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">الحالة</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item, index) => {
                const rowClass = item.status === 'out' ? 'inventory-row-out bg-red-50' : item.status === 'low' ? 'inventory-row-low bg-amber-50' : 'hover:bg-slate-50';
                return (
                  <tr key={item.variant_id || index} className={`border-b border-border last:border-0 ${rowClass}`}>
                    <td className="px-4 py-3 text-text-muted">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-text">{item.product_name}</td>
                    <td className="px-4 py-3 text-text-muted">{item.variant_name}</td>
                    <td className="px-4 py-3 text-text-muted">{item.supplier_name}</td>
                    <td className="px-4 py-3 text-text-muted">{item.category}</td>
                    <td className="px-4 py-3 font-mono text-text">{formatCurrency(item.purchase_price)}</td>
                    <td className="px-4 py-3 font-mono text-text">{formatCurrency(item.sale_price)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-text">{item.current_stock.toLocaleString('ar-EG')}</td>
                    <td className="px-4 py-3 font-mono text-text-muted">{formatCurrency(item.purchase_price * item.current_stock)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(item.status)}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${item.status === 'out' ? 'bg-red-500' : item.status === 'low' ? 'bg-amber-500' : 'bg-green-500'}`} />
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot className="bg-slate-50 border-t-2 border-border">
              <tr>
                <td colSpan={7} className="px-4 py-3 text-sm font-medium text-text-muted">
                  {filtered.length} صنف
                </td>
                <td className="px-4 py-3 font-mono font-bold text-text">{filteredTotalQty.toLocaleString('ar-EG')}</td>
                <td className="px-4 py-3 font-mono font-bold text-primary">{formatCurrency(filteredCostValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-text-muted">
            <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>لا توجد منتجات مطابقة للبحث</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-white p-4 text-sm">
        <div className="flex flex-wrap items-center gap-6">
          <p>
            إجمالي قيمة المخزن بسعر الشراء: <span className="font-mono font-bold text-text">{formatCurrency(filteredCostValue)}</span>
          </p>
          <p>
            إجمالي قيمة المخزن بسعر البيع: <span className="font-mono font-bold text-text">{formatCurrency(filteredSaleValue)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
