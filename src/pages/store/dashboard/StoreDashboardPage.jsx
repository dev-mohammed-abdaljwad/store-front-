import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfMonth, subDays } from 'date-fns';
import {
  AlertTriangle,
  Banknote,
  FileText,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  CreditCard,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { getCashBalance } from '../../../api/cash';
import { getCustomers } from '../../../api/customers';
import { getInventoryDeficits } from '../../../api/inventory';
import { getProducts } from '../../../api/products';
import { getPurchaseInvoices } from '../../../api/purchaseInvoices';
import { getSalesInvoices } from '../../../api/salesInvoices';
import { getAllCustomerPayments } from '../../../api/payments';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import StatusBadge from '../../../components/shared/StatusBadge';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency } from '../../../utils/formatters';

const PIE_COLORS = ['#16A34A', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EC4899', '#64748B'];

const extractPayload = (response) => response?.data?.data ?? response?.data ?? {};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const extractList = (response, fallbackKeys = []) => {
  const payload = extractPayload(response);

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;

  for (const key of fallbackKeys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(response?.data?.[key])) return response.data[key];
  }

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(response?.data)) return response.data;
  return [];
};

const normalizeDateKey = (value) => {
  if (!value) return null;
  try {
    if (typeof value === 'string' && value.length >= 10) {
      return value.slice(0, 10);
    }
    return format(parseISO(String(value)), 'yyyy-MM-dd');
  } catch {
    return null;
  }
};

const getInvoiceDate = (invoice) => invoice?.invoice_date || invoice?.date || invoice?.sort_date || invoice?.created_at || null;
const getInvoiceStatus = (invoice) => String(invoice?.status || '').toLowerCase();
const isConfirmedInvoice = (invoice) => {
  const status = getInvoiceStatus(invoice);
  if (!status) return true;
  return status === 'confirmed';
};
const getInvoiceTotal = (invoice) =>
  toNumber(invoice?.total_amount ?? invoice?.total ?? invoice?.grand_total ?? invoice?.amount ?? 0, 0);

const getDailyRange = () => {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const weekAgo = format(subDays(now, 6), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  return { today, weekAgo, monthStart };
};

const buildDayKeys = (fromDate, toDate) => {
  const from = parseISO(fromDate);
  const to = parseISO(toDate);
  const days = [];
  let pointer = from;
  while (pointer <= to) {
    days.push(format(pointer, 'yyyy-MM-dd'));
    pointer = subDays(pointer, -1);
  }
  return days;
};

const formatDayLabel = (dateKey) => {
  try {
    return format(parseISO(dateKey), 'dd/MM');
  } catch {
    return dateKey;
  }
};

const formatAbbrev = (value) => {
  const amount = toNumber(value);
  if (Math.abs(amount) >= 1000000) return `${(amount / 1000000).toFixed(1)}m`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(0)}k`;
  return amount.toLocaleString('ar-EG');
};

const sumConfirmedInvoices = (invoices) =>
  invoices.reduce((total, invoice) => (isConfirmedInvoice(invoice) ? total + getInvoiceTotal(invoice) : total), 0);

const groupByDay = (invoices, dayKeys) => {
  const bucket = dayKeys.reduce((accumulator, dateKey) => ({ ...accumulator, [dateKey]: 0 }), {});

  invoices.forEach((invoice) => {
    if (!isConfirmedInvoice(invoice)) return;
    const dateKey = normalizeDateKey(getInvoiceDate(invoice));
    if (!dateKey || typeof bucket[dateKey] === 'undefined') return;
    bucket[dateKey] += getInvoiceTotal(invoice);
  });

  return dayKeys.map((dateKey) => ({
    date: dateKey,
    label: formatDayLabel(dateKey),
    total: toNumber(bucket[dateKey]),
  }));
};

const extractInvoiceItems = (invoice) => {
  if (Array.isArray(invoice?.items)) return invoice.items;
  if (Array.isArray(invoice?.invoice_items)) return invoice.invoice_items;
  if (Array.isArray(invoice?.products)) return invoice.products;
  return [];
};

const getCategoryNameFromItem = (item) => {
  return (
    item?.category?.name ||
    item?.category_name ||
    item?.product?.category?.name ||
    item?.product_category_name ||
    item?.product?.category_name ||
    ''
  );
};

const getItemTotal = (item) => {
  const direct = toNumber(item?.line_total ?? item?.total_amount ?? item?.total);
  if (direct > 0) return direct;
  const quantity = toNumber(item?.quantity);
  const unitPrice = toNumber(item?.unit_price ?? item?.price ?? item?.sale_price);
  return quantity * unitPrice;
};

const buildSalesCategoriesPie = (invoices) => {
  const categoriesMap = new Map();
  let overallTotal = 0;

  invoices.forEach((invoice) => {
    if (!isConfirmedInvoice(invoice)) return;

    extractInvoiceItems(invoice).forEach((item) => {
      const categoryName = getCategoryNameFromItem(item);
      if (!categoryName) return;
      const value = getItemTotal(item);
      if (value <= 0) return;

      overallTotal += value;
      categoriesMap.set(categoryName, (categoriesMap.get(categoryName) || 0) + value);
    });
  });

  if (categoriesMap.size === 0 || overallTotal <= 0) {
    return { hasCategoryData: false, data: [] };
  }

  const sorted = [...categoriesMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const topFive = sorted.slice(0, 5);
  const restTotal = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
  const chartData = restTotal > 0 ? [...topFive, { name: 'أخرى', value: restTotal }] : topFive;

  return {
    hasCategoryData: true,
    data: chartData.map((item) => ({
      ...item,
      percentage: overallTotal > 0 ? (item.value / overallTotal) * 100 : 0,
    })),
  };
};

const getProductVariants = (product) => (Array.isArray(product?.variants) ? product.variants : []);
const isLowStockVariant = (variant) => {
  if (Boolean(variant?.is_low_stock)) return true;
  const stock = toNumber(variant?.current_stock);
  const threshold = toNumber(variant?.low_stock_threshold);
  return threshold > 0 && stock <= threshold;
};

// Extract payment amount from various field names
const getPaymentAmount = (payment) =>
  toNumber(payment?.amount ?? payment?.paid_amount ?? payment?.payment_amount ?? 0, 0);

// Extract payment date from various field names
const getPaymentDate = (payment) =>
  payment?.payment_date ?? payment?.date ?? payment?.paid_at ?? payment?.created_at ?? null;

// Group payments by customer and sum amounts
const buildTopCollectors = (payments, count = 5) => {
  const map = new Map();
  payments.forEach((p) => {
    const customerId = p?.customer_id ?? p?.customer?.id;
    if (!customerId) return;
    const name = p?.customer?.name ?? p?.customer_name ?? `عميل #${customerId}`;
    const amount = getPaymentAmount(p);
    if (amount <= 0) return;
    if (map.has(customerId)) {
      map.get(customerId).total += amount;
    } else {
      map.set(customerId, { id: customerId, name, total: amount });
    }
  });
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, count);
};

function SkeletonCard() {
  return (
    <div className="w-full rounded-xl border border-border bg-white p-5 animate-pulse">
      <div className="mb-3 h-4 w-24 rounded bg-slate-200" />
      <div className="mb-2 h-8 w-32 rounded bg-slate-200" />
      <div className="h-3 w-20 rounded bg-slate-200" />
    </div>
  );
}

function StatsMiniCard({ title, value, subtitle, icon: Icon, colorClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border border-border bg-white p-4 text-right ${onClick ? 'transition hover:bg-slate-50' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between gap-1">
        <h3 className="text-sm font-medium text-text-muted truncate">{title}</h3>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
          <Icon className="h-4 w-4 text-white" />
        </span>
      </div>
      <p className="text-xl font-bold text-text truncate">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-text-muted truncate">{subtitle}</p> : null}
    </button>
  );
}

function ChartContainer({ title, children, isLoading }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-white p-4">
      <h3 className="mb-3 font-semibold text-text">{title}</h3>
      <div className="h-[280px] w-full min-w-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((row) => (
        <div key={row} className="h-10 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

// ─── Invoices Summary Table ───────────────────────────────────────────────────
function InvoiceSummaryTable({ title, invoices, type, isLoading, onViewAll, navigatePath }) {
  const navigate = useNavigate();
  const borderColor = type === 'sales' ? 'border-emerald-200' : 'border-sky-200';
  const emptyMsg = type === 'sales' ? 'لا توجد فواتير بيع' : 'لا توجد فواتير شراء';

  return (
    <div className={`rounded-xl border ${borderColor} bg-white p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-text">{title}</h3>
        <button
          type="button"
          onClick={() => navigate(navigatePath)}
          className="text-sm font-semibold text-primary"
        >
          عرض الكل →
        </button>
      </div>

      {isLoading ? (
        <TableSkeletonRows />
      ) : invoices.length === 0 ? (
        <p className="rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">{emptyMsg}</p>
      ) : (
        <div className="space-y-2 text-sm">
          {invoices.map((invoice) => (
            <button
              key={invoice?.id}
              type="button"
              onClick={() => navigate(navigatePath)}
              className="grid w-full grid-cols-12 items-center rounded-lg border border-border px-3 py-2 text-right hover:bg-bg"
            >
              <span className="col-span-3 font-mono font-semibold text-text">
                {invoice?.invoice_number || `#${invoice?.id}`}
              </span>
              <span className="col-span-4 truncate text-text-muted">
                {type === 'sales'
                  ? invoice?.customer?.name || invoice?.customer_name || '—'
                  : invoice?.supplier?.name || invoice?.supplier_name || '—'}
              </span>
              <span className="col-span-3 font-semibold text-text">
                {formatCurrency(getInvoiceTotal(invoice))}
              </span>
              <span className="col-span-2 flex justify-end">
                <StatusBadge status={invoice?.status || 'confirmed'} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Invoices Panel: today + week tabs ────────────────────────────────────────
function InvoicesPanelSection({
  salesTodayInvoices,
  purchasesTodayInvoices,
  sales7Invoices,
  purchases7Invoices,
  salesTodayLoading,
  purTodayLoading,
  sales7Loading,
  pur7Loading,
}) {
  const [period, setPeriod] = useState('today'); // 'today' | 'week'
  const [type, setType] = useState('sales'); // 'sales' | 'purchases'

  const invoices =
    period === 'today'
      ? type === 'sales'
        ? salesTodayInvoices
        : purchasesTodayInvoices
      : type === 'sales'
        ? sales7Invoices
        : purchases7Invoices;

  const isLoading =
    period === 'today'
      ? type === 'sales'
        ? salesTodayLoading
        : purTodayLoading
      : type === 'sales'
        ? sales7Loading
        : pur7Loading;

  const navigatePath = type === 'sales' ? '/store/sales-invoices' : '/store/purchase-invoices';
  const navigate = useNavigate();

  const sorted = [...invoices]
    .sort((a, b) => (getInvoiceDate(b) || '').localeCompare(getInvoiceDate(a) || ''))
    .slice(0, 8);

  const totalAmount = sumConfirmedInvoices(invoices);
  const label = type === 'sales' ? 'فواتير بيع' : 'فواتير شراء';
  const borderColor = type === 'sales' ? 'border-emerald-200' : 'border-sky-200';
  const totalColor = type === 'sales' ? 'text-emerald-700' : 'text-sky-700';

  return (
    <div className={`rounded-xl border ${borderColor} bg-white p-4`}>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text">📄 {label}</h3>
        <button
          type="button"
          onClick={() => navigate(navigatePath)}
          className="text-sm font-semibold text-primary"
        >
          عرض الكل →
        </button>
      </div>

      {/* Period + Type tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {/* Period tabs */}
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
          <button
            type="button"
            onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 ${period === 'today' ? 'bg-primary text-white' : 'text-text-muted hover:bg-bg'}`}
          >
            اليوم
          </button>
          <button
            type="button"
            onClick={() => setPeriod('week')}
            className={`border-r border-border px-3 py-1.5 ${period === 'week' ? 'bg-primary text-white' : 'text-text-muted hover:bg-bg'}`}
          >
            آخر 7 أيام
          </button>
        </div>

        {/* Type tabs */}
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
          <button
            type="button"
            onClick={() => setType('sales')}
            className={`px-3 py-1.5 ${type === 'sales' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
          >
            بيع
          </button>
          <button
            type="button"
            onClick={() => setType('purchases')}
            className={`border-r border-border px-3 py-1.5 ${type === 'purchases' ? 'bg-sky-600 text-white' : 'text-sky-700 hover:bg-sky-50'}`}
          >
            شراء
          </button>
        </div>
      </div>

      {/* Total summary */}
      {!isLoading && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-sm">
          <span className="text-text-muted">
            {invoices.length.toLocaleString('ar-EG')} فاتورة
          </span>
          <span className={`font-bold ${totalColor}`}>{formatCurrency(totalAmount)}</span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeletonRows />
      ) : sorted.length === 0 ? (
        <p className="rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">لا توجد فواتير في هذه الفترة</p>
      ) : (
        <div className="space-y-2 text-sm">
          {sorted.map((invoice) => (
            <button
              key={invoice?.id}
              type="button"
              onClick={() => navigate(navigatePath)}
              className="grid w-full grid-cols-12 items-center rounded-lg border border-border px-3 py-2 text-right hover:bg-bg"
            >
              <span className="col-span-3 font-mono font-semibold text-text">
                {invoice?.invoice_number || `#${invoice?.id}`}
              </span>
              <span className="col-span-4 truncate text-text-muted">
                {type === 'sales'
                  ? invoice?.customer?.name || invoice?.customer_name || '—'
                  : invoice?.supplier?.name || invoice?.supplier_name || '—'}
              </span>
              <span className="col-span-3 font-semibold text-text">
                {formatCurrency(getInvoiceTotal(invoice))}
              </span>
              <span className="col-span-2 flex justify-end">
                <StatusBadge status={invoice?.status || 'confirmed'} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StoreDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const store = useAuthStore((state) => state.store);
  const [stockAlertTab, setStockAlertTab] = useState('low');
  const currentStoreId = Number(store?.id ?? store?.store_id ?? 0) || undefined;
  const { today, weekAgo, monthStart } = useMemo(() => getDailyRange(), []);

  // ── Queries ────────────────────────────────────────────────────────────────
  const cashQ = useQuery({
    queryKey: ['dash-cash'],
    queryFn: getCashBalance,
  });
  const salesTodayQ = useQuery({
    queryKey: ['dash-sales-today', today],
    queryFn: () => getSalesInvoices(1, { from: today, to: today, per_page: 100 }),
  });
  const purTodayQ = useQuery({
    queryKey: ['dash-pur-today', today],
    queryFn: () => getPurchaseInvoices(1, { from: today, to: today, per_page: 100 }),
  });
  const sales7Q = useQuery({
    queryKey: ['dash-sales-7', weekAgo, today],
    queryFn: () => getSalesInvoices(1, { from: weekAgo, to: today, per_page: 200 }),
  });
  const pur7Q = useQuery({
    queryKey: ['dash-pur-7', weekAgo, today],
    queryFn: () => getPurchaseInvoices(1, { from: weekAgo, to: today, per_page: 200 }),
  });
  const salesMonthQ = useQuery({
    queryKey: ['dash-sales-month', monthStart, today],
    queryFn: () => getSalesInvoices(1, { from: monthStart, to: today, per_page: 500 }),
  });
  const purMonthQ = useQuery({
    queryKey: ['dash-pur-month', monthStart, today],
    queryFn: () => getPurchaseInvoices(1, { from: monthStart, to: today, per_page: 500 }),
  });
  const categoryStatsQ = useQuery({
    queryKey: ['dash-category-stats', monthStart, today],
    queryFn: () => {
      const { getSalesCategoryStats } = require('../../../api/salesInvoices');
      return getSalesCategoryStats({ from: monthStart, to: today });
    },
  });
  const customersQ = useQuery({
    queryKey: ['dash-customers'],
    queryFn: () => getCustomers(1, { per_page: 200 }),
  });
  const lowStockQ = useQuery({
    queryKey: ['dash-low-stock', currentStoreId],
    queryFn: () => getProducts(1, { store_id: currentStoreId, low_stock: 1, per_page: 50 }),
  });
  const deficitsQ = useQuery({
    queryKey: ['dash-deficits', currentStoreId],
    queryFn: () => getInventoryDeficits({ store_id: currentStoreId }),
  });

  // ── Payments queries ────────────────────────────────────────────────────
  const paymentsTodayQ = useQuery({
    queryKey: ['dash-payments-today', today],
    queryFn: () => getAllCustomerPayments({ from: today, to: today, per_page: 200 }),
  });
  const payments7Q = useQuery({
    queryKey: ['dash-payments-7', weekAgo, today],
    queryFn: () => getAllCustomerPayments({ from: weekAgo, to: today, per_page: 500 }),
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const greetingDate = useMemo(
    () => new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    []
  );

  const greetingLabel = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
  const displayName = user?.name || user?.store?.name || 'صاحب المتجر';
  const monthName = new Date().toLocaleDateString('ar-EG', { month: 'long' });

  const cashPayload = extractPayload(cashQ.data);
  const cashBalance = toNumber(cashPayload?.current_balance ?? cashPayload?.balance);

  const salesTodayInvoices = extractList(salesTodayQ.data, ['invoices', 'sales_invoices']);
  const purchasesTodayInvoices = extractList(purTodayQ.data, ['invoices', 'purchase_invoices']);
  const sales7Invoices = extractList(sales7Q.data, ['invoices', 'sales_invoices']);
  const purchases7Invoices = extractList(pur7Q.data, ['invoices', 'purchase_invoices']);
  const salesMonthInvoices = extractList(salesMonthQ.data, ['invoices', 'sales_invoices']);
  const purchasesMonthInvoices = extractList(purMonthQ.data, ['invoices', 'purchase_invoices']);
  const customers = extractList(customersQ.data, ['customers']);
  const lowStockProducts = extractList(lowStockQ.data, ['products']);
  const deficitsPayload = extractPayload(deficitsQ.data);
  const deficitsList = extractList(deficitsQ.data, ['deficits']);

  const paymentsToday = extractList(paymentsTodayQ.data, ['payments', 'data']);
  const payments7 = extractList(payments7Q.data, ['payments', 'data']);

  const categoryStatsPayload = extractPayload(categoryStatsQ.data);
  const categoryStatsList = Array.isArray(categoryStatsPayload?.categories) ? categoryStatsPayload.categories : [];
  const grossProfit = toNumber(categoryStatsPayload?.gross_profit);
  const profitMargin = toNumber(categoryStatsPayload?.gross_profit_margin);

  const pieCategory = useMemo(() => {
    if (categoryStatsList.length === 0) {
      return { hasCategoryData: false, data: [] };
    }
    const chartData = categoryStatsList.map((item) => ({
      name: item.category || 'بدون تصنيف',
      value: toNumber(item.total_sales),
      percentage: toNumber(item.percentage),
    }));
    return { hasCategoryData: true, data: chartData };
  }, [categoryStatsList]);

  const dayKeys = useMemo(() => buildDayKeys(weekAgo, today), [today, weekAgo]);
  const sales7Series = useMemo(() => groupByDay(sales7Invoices, dayKeys), [dayKeys, sales7Invoices]);
  const purchases7Series = useMemo(() => groupByDay(purchases7Invoices, dayKeys), [dayKeys, purchases7Invoices]);

  const compareSeries = useMemo(
    () =>
      dayKeys.map((dayKey) => {
        const salesValue = sales7Series.find((item) => item.date === dayKey)?.total || 0;
        const purchaseValue = purchases7Series.find((item) => item.date === dayKey)?.total || 0;
        return {
          date: dayKey,
          label: formatDayLabel(dayKey),
          sales: salesValue,
          purchases: purchaseValue,
        };
      }),
    [dayKeys, purchases7Series, sales7Series]
  );

  const salesTodayTotal = sumConfirmedInvoices(salesTodayInvoices);
  const purchasesTodayTotal = sumConfirmedInvoices(purchasesTodayInvoices);
  const todayInvoicesCount = salesTodayInvoices.length + purchasesTodayInvoices.length;

  const debtCustomers = useMemo(
    () => customers.filter((customer) => toNumber(customer?.balance) > 0).sort((a, b) => toNumber(b?.balance) - toNumber(a?.balance)),
    [customers]
  );
  const debtCustomersCount = debtCustomers.length;
  const totalDebtAmount = debtCustomers.reduce((sum, customer) => sum + toNumber(customer?.balance), 0);

  const salesMonthTotal = sumConfirmedInvoices(salesMonthInvoices);
  const purchasesMonthTotal = sumConfirmedInvoices(purchasesMonthInvoices);


  const lowStockRows = useMemo(() => {
    const rows = [];
    lowStockProducts.forEach((product) => {
      const variants = getProductVariants(product);

      variants.forEach((variant) => {
        if (!isLowStockVariant(variant)) return;
        rows.push({
          id: `${product?.id || 'p'}-${variant?.id || 'v'}`,
          productLabel: `${product?.name || '—'}${variant?.name ? ` - ${variant.name}` : ''}`,
          available: toNumber(variant?.current_stock),
          limit: toNumber(variant?.low_stock_threshold),
        });
      });
    });

    return rows.sort((a, b) => a.available - b.available).slice(0, 5);
  }, [lowStockProducts]);

  const deficitRows = useMemo(() => {
    return deficitsList
      .map((item, index) => {
        const currentStock = toNumber(item?.current_stock);
        const explicitDeficit = toNumber(item?.deficit ?? item?.deficit_quantity);
        const deficit = explicitDeficit > 0 ? explicitDeficit : Math.max(Math.abs(currentStock), 0);

        return {
          id: String(item?.variant_id ?? item?.id ?? `def-${index}`),
          productLabel: `${item?.product_name || item?.product?.name || '—'}${item?.variant_name ? ` - ${item.variant_name}` : ''}`,
          deficit,
        };
      })
      .filter((item) => item.deficit > 0)
      .slice(0, 5);
  }, [deficitsList]);

  const deficitCount = toNumber(deficitsPayload?.total_deficit_items, deficitRows.length || deficitsList.length);

  // ── Payments derived ──────────────────────────────────────────────────────
  const paymentsTodayTotal = useMemo(
    () => paymentsToday.reduce((sum, p) => sum + getPaymentAmount(p), 0),
    [paymentsToday]
  );
  const payments7Total = useMemo(
    () => payments7.reduce((sum, p) => sum + getPaymentAmount(p), 0),
    [payments7]
  );
  const topCollectors7 = useMemo(() => buildTopCollectors(payments7, 5), [payments7]);

  const cardsLoading = cashQ.isLoading || salesTodayQ.isLoading || purTodayQ.isLoading || customersQ.isLoading;

  return (
    <div>
      <PageHeader title="لوحة المتجر" subtitle={`${greetingLabel}، ${displayName} — ${greetingDate}`} />

      {/* ── Stats cards ─────────────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cardsLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatsMiniCard
              title="رصيد الخزنة"
              value={formatCurrency(cashBalance)}
              icon={Banknote}
              colorClass="bg-emerald-600"
            />
            <StatsMiniCard
              title="مبيعات اليوم"
              value={formatCurrency(salesTodayTotal)}
              icon={TrendingUp}
              colorClass="bg-sky-600"
            />
            <StatsMiniCard
              title="فواتير اليوم"
              value={todayInvoicesCount.toLocaleString('ar-EG')}
              icon={FileText}
              colorClass="bg-violet-600"
            />
            <StatsMiniCard
              title="مشتريات اليوم"
              value={formatCurrency(purchasesTodayTotal)}
              icon={ShoppingCart}
              colorClass="bg-amber-500"
            />
            <StatsMiniCard
              title="تحصيلات اليوم"
              value={formatCurrency(paymentsTodayTotal)}
              subtitle={paymentsTodayQ.isLoading ? '...' : `${paymentsToday.length.toLocaleString('ar-EG')} عملية`}
              icon={Wallet}
              colorClass="bg-teal-600"
            />
            <StatsMiniCard
              title="عملاء بديون"
              value={debtCustomersCount.toLocaleString('ar-EG')}
              subtitle={`إجمالي ${formatCurrency(totalDebtAmount)}`}
              icon={Users}
              colorClass="bg-red-600"
            />
          </>
        )}
      </div>

      {/* ── Collection summary cards ─────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-teal-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600">
              <Wallet className="h-4 w-4 text-white" />
            </span>
            <h3 className="font-semibold text-text">تحصيلات اليوم</h3>
          </div>
          {paymentsTodayQ.isLoading ? (
            <div className="h-10 animate-pulse rounded bg-slate-100 mt-2" />
          ) : (
            <div className="mt-2">
              <p className="text-2xl font-bold text-teal-700">{formatCurrency(paymentsTodayTotal)}</p>
              <p className="text-xs text-text-muted mt-1">{paymentsToday.length.toLocaleString('ar-EG')} عملية تحصيل</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-teal-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500">
              <CreditCard className="h-4 w-4 text-white" />
            </span>
            <h3 className="font-semibold text-text">تحصيلات آخر 7 أيام</h3>
          </div>
          {payments7Q.isLoading ? (
            <div className="h-10 animate-pulse rounded bg-slate-100 mt-2" />
          ) : (
            <div className="mt-2">
              <p className="text-2xl font-bold text-teal-600">{formatCurrency(payments7Total)}</p>
              <p className="text-xs text-text-muted mt-1">{payments7.length.toLocaleString('ar-EG')} عملية تحصيل</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600">
              <Users className="h-4 w-4 text-white" />
            </span>
            <h3 className="font-semibold text-text">إجمالي الديون</h3>
          </div>
          {customersQ.isLoading ? (
            <div className="h-10 animate-pulse rounded bg-slate-100 mt-2" />
          ) : (
            <div className="mt-2">
              <p className="text-2xl font-bold text-red-700">{formatCurrency(totalDebtAmount)}</p>
              <p className="text-xs text-text-muted mt-1">{debtCustomersCount.toLocaleString('ar-EG')} عميل لديه دين</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <ChartContainer title="مبيعات آخر 7 أيام" isLoading={sales7Q.isLoading}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={sales7Series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={formatAbbrev} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="total" fill="#16A34A" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="مشتريات آخر 7 أيام" isLoading={pur7Q.isLoading}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={purchases7Series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={formatAbbrev} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="total" fill="#F59E0B" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="توزيع المبيعات بالتصنيف" isLoading={salesMonthQ.isLoading}>
          {!pieCategory.hasCategoryData ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-muted">
              سيتوفر هذا التقرير قريباً
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={pieCategory.data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={85}
                  label={({ name, percent }) => `${name} (${Math.round((percent || 0) * 100)}%)`}
                >
                  {pieCategory.data.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _, info) => {
                    const percentage = toNumber(info?.payload?.percentage);
                    return `${formatCurrency(value)} (${Math.round(percentage)}%)`;
                  }}
                  labelFormatter={(name) => name}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>

      {/* ── Compare chart + month summary ──────────────────────────────── */}
      <div className="mb-5 grid gap-4 xl:grid-cols-3">

        <div className="min-w-0 xl:col-span-2">
          <ChartContainer title="مقارنة المبيعات والمشتريات" isLoading={sales7Q.isLoading || pur7Q.isLoading}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={compareSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={formatAbbrev} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="sales" name="مبيعات" stroke="#16A34A" strokeWidth={3} dot={{ r: 3 }} />
                <Line
                  type="monotone"
                  dataKey="purchases"
                  name="مشتريات"
                  stroke="#F59E0B"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        <div className="rounded-xl border border-border bg-white p-4">
          <h3 className="mb-3 font-semibold text-text">ملخص شهر {monthName}</h3>
          {salesMonthQ.isLoading || purMonthQ.isLoading ? (
            <div className="flex h-[220px] items-center justify-center">
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="mb-1 text-xs text-text-muted">المبيعات</p>
                  <p className="font-bold text-emerald-700">{formatCurrency(salesMonthTotal)}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="mb-1 text-xs text-text-muted">المشتريات</p>
                  <p className="font-bold text-red-700">{formatCurrency(purchasesMonthTotal)}</p>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50 px-3 py-4 text-center">
                <p className="text-xs text-text-muted mb-1">الربح التقريبي (المبيعات - المشتريات)</p>
                <p className={`text-xl font-bold ${grossProfit >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                  {formatCurrency(grossProfit)}
                </p>
                <p className="text-[10px] text-text-muted mt-1">هامش الربح: {profitMargin}%</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Invoices panel (today / week, sales / purchases) ────────────── */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <InvoicesPanelSection
          salesTodayInvoices={salesTodayInvoices}
          purchasesTodayInvoices={purchasesTodayInvoices}
          sales7Invoices={sales7Invoices}
          purchases7Invoices={purchases7Invoices}
          salesTodayLoading={salesTodayQ.isLoading}
          purTodayLoading={purTodayQ.isLoading}
          sales7Loading={sales7Q.isLoading}
          pur7Loading={pur7Q.isLoading}
        />

        {/* Top collecting customers */}
        <div className="rounded-xl border border-teal-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-text">💰 أكثر العملاء تحصيلاً (7 أيام)</h3>
            <button
              type="button"
              onClick={() => navigate('/store/customers')}
              className="text-sm font-semibold text-primary"
            >
              عرض الكل →
            </button>
          </div>

          {payments7Q.isLoading ? (
            <TableSkeletonRows />
          ) : topCollectors7.length === 0 ? (
            <p className="rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">لا توجد تحصيلات في آخر 7 أيام</p>
          ) : (
            <div className="space-y-2 text-sm">
              {topCollectors7.map((collector, index) => (
                <div
                  key={collector.id}
                  className="grid grid-cols-12 items-center rounded-lg border border-border px-3 py-2"
                >
                  <span className="col-span-1 font-bold text-text-muted text-xs">{index + 1}</span>
                  <span className="col-span-7 truncate text-text">{collector.name}</span>
                  <span className="col-span-4 font-mono font-bold text-teal-700 text-left">
                    {formatCurrency(collector.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom tables ────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Stock alerts */}
        <div className="rounded-xl border border-amber-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-text">تنبيهات المخزون</h3>
            <button type="button" onClick={() => navigate('/store/products')} className="text-sm font-semibold text-primary">
              عرض الكل →
            </button>
          </div>

          <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-border text-sm">
            <button
              type="button"
              onClick={() => setStockAlertTab('low')}
              className={`px-3 py-1.5 ${stockAlertTab === 'low' ? 'bg-amber-500 text-white' : 'text-amber-700 hover:bg-amber-50'}`}
            >
              منخفض ⚠️
            </button>
            <button
              type="button"
              onClick={() => setStockAlertTab('deficit')}
              className={`border-r border-border px-3 py-1.5 ${stockAlertTab === 'deficit' ? 'bg-red-600 text-white' : 'text-red-700 hover:bg-red-50'}`}
            >
              عجز 🔴
            </button>
          </div>

          {lowStockQ.isLoading || deficitsQ.isLoading ? (
            <TableSkeletonRows />
          ) : stockAlertTab === 'low' && lowStockRows.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ كل المنتجات مخزونها كاف</p>
          ) : stockAlertTab === 'deficit' && deficitRows.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ لا يوجد عجز في المخزون</p>
          ) : (
            <div className="space-y-2 text-sm">
              {stockAlertTab === 'low'
                ? lowStockRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 items-center rounded-lg border border-border px-3 py-2">
                    <p className="col-span-6 truncate text-text">{row.productLabel}</p>
                    <p className="col-span-3 text-center font-bold text-red-600">{row.available.toLocaleString('ar-EG')}</p>
                    <p className="col-span-3 text-left text-text-muted">{row.limit.toLocaleString('ar-EG')}</p>
                  </div>
                ))
                : deficitRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="col-span-8 truncate text-text">{row.productLabel}</p>
                    <p className="col-span-4 text-left font-bold text-red-700">عجز {row.deficit.toLocaleString('ar-EG')}</p>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Top debt customers */}
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-text">👥 أكثر العملاء ديناً</h3>
            <button type="button" onClick={() => navigate('/store/customers')} className="text-sm font-semibold text-primary">
              عرض الكل →
            </button>
          </div>

          {customersQ.isLoading ? (
            <TableSkeletonRows />
          ) : debtCustomers.length === 0 ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ لا يوجد عملاء بديون</p>
          ) : (
            <div className="space-y-2 text-sm">
              {debtCustomers.slice(0, 5).map((customer, index) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() =>
                    navigate(`/store/customers/${customer.id}/statement`, {
                      state: { name: customer?.name, phone: customer?.phone, balance: toNumber(customer?.balance) },
                    })
                  }
                  className="grid w-full grid-cols-12 items-center rounded-lg border border-border px-3 py-2 text-right hover:bg-bg"
                >
                  <span className="col-span-1 font-bold text-text-muted text-xs">{index + 1}</span>
                  <span className="col-span-7 truncate text-text">{customer?.name || '—'}</span>
                  <span className="col-span-4 font-mono font-bold text-red-600">{formatCurrency(toNumber(customer?.balance))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
