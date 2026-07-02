import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, HandCoins, Plus, Search, XCircle, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getCustomers } from '../../../api/customers';
import { createCustomerPayment, getAllCustomerPayments, getCustomerPayments, updatePayment, deletePayment } from '../../../api/payments';
import { cancelSalesInvoice, getSalesInvoice, getSalesInvoices, getSalesRepsStats } from '../../../api/salesInvoices';
import BalanceDisplay from '../../../components/shared/BalanceDisplay';
import DataTable from '../../../components/shared/DataTable';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import Pagination from '../../../components/shared/Pagination';
import StatusBadge from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { normalizePaginatedResponse } from '../../../utils/pagination';
import SalesReturnsTab from './SalesReturnsTab';

const customerReceiptSchema = z.object({
  invoice_id: z.coerce.number().optional(),
  party_id: z.coerce.number().min(1, 'العميل مطلوب'),
  amount: z.coerce.number().min(0.01, 'المبلغ يجب أن يكون أكبر من صفر'),
  notes: z.string().optional(),
  date: z.string().min(1, 'التاريخ مطلوب'),
  receipt_number: z.string().optional(),
});

const getTodayDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractItems = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.customers)) return payload.customers;
  if (Array.isArray(payload)) return payload;
  return [];
};

const extractInvoicePayload = (response) => {
  const payload = response?.data?.data ?? response?.data ?? {};
  return payload?.invoice ?? payload;
};

const SALES_INVOICES_PER_PAGE = 10;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getInvoiceDate = (invoice) => invoice?.invoice_date || invoice?.date || invoice?.sort_date || invoice?.created_at || null;
const getInvoiceNumber = (invoice) => invoice?.invoice_number || invoice?.number || `INV-${invoice?.id}`;
const getCustomerId = (invoice) => invoice?.customer?.id || invoice?.customer_id || invoice?.client?.id || invoice?.client_id || 0;
const getCustomerName = (invoice) =>
  invoice?.customer?.name || invoice?.customer_name || invoice?.client?.name || invoice?.client_name || '—';
const getInvoiceAmount = (invoice, key) => {
  if (key === 'paid') return toNumber(invoice?.paid_amount ?? invoice?.paid ?? 0);
  if (key === 'remaining') return toNumber(invoice?.remaining_amount ?? invoice?.due_amount ?? invoice?.remaining ?? 0);
  return toNumber(invoice?.total_amount ?? invoice?.total ?? invoice?.grand_total ?? invoice?.amount ?? 0);
};

const normalizeList = (response) => {
  const normalized = normalizePaginatedResponse(response);
  const raw = response?.data ?? {};
  const payload = normalized.payload || {};
  const fallbackInvoices = Array.isArray(payload?.invoices)
    ? payload.invoices
    : Array.isArray(raw?.invoices)
      ? raw.invoices
      : [];
  const items = normalized.items.length > 0 ? normalized.items : fallbackInvoices;
  const paginationSource = payload?.pagination || raw?.pagination;

  const meta = paginationSource
    ? {
      page: Math.max(1, toNumber(paginationSource?.current_page ?? paginationSource?.page, normalized.meta.page)),
      perPage: Math.max(1, toNumber(paginationSource?.per_page ?? paginationSource?.perPage, SALES_INVOICES_PER_PAGE)),
      total: Math.max(0, toNumber(paginationSource?.total, normalized.meta.total)),
      lastPage: Math.max(
        1,
        toNumber(
          paginationSource?.last_page ?? paginationSource?.lastPage,
          normalized.meta.lastPage
        )
      ),
    }
    : normalized.meta;

  return {
    items,
    meta,
    payload,
  };
};

const getStatusOptions = () => [
  { value: '', label: 'كل الحالات' },
  { value: 'confirmed', label: 'مؤكدة' },
  { value: 'cancelled', label: 'ملغاة' },
];

export default function SalesInvoicesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('invoices');
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    customer_id: '',
    status: '',
    from: '',
    to: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [detailsInvoiceId, setDetailsInvoiceId] = useState(null);
  const [cancelInvoice, setCancelInvoice] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptSearchTerm, setReceiptSearchTerm] = useState('');
  const [debouncedReceiptSearchTerm, setDebouncedReceiptSearchTerm] = useState('');
  const [paymentsCurrentPage, setPaymentsCurrentPage] = useState(1);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentsModalOpen, setPaymentsModalOpen] = useState(false);
  useEffect(() => {
    // debug: track modal open state
    // eslint-disable-next-line no-console
    console.log('SalesPaymentsModalOpen=', paymentsModalOpen);
  }, [paymentsModalOpen]);
  const [editingSaving, setEditingSaving] = useState(false);

  const {
    register: registerReceipt,
    handleSubmit: handleReceiptSubmit,
    reset: resetReceiptForm,
    watch: watchReceipt,
    setValue: setReceiptValue,
    formState: { errors: receiptErrors },
  } = useForm({
    resolver: zodResolver(customerReceiptSchema),
    defaultValues: {
      invoice_id: 0,
      party_id: 0,
      amount: '',
      notes: '',
      date: getTodayDate(),
      receipt_number: '',
    },
  });

  const customersQuery = useQuery({
    queryKey: ['customers-for-sales-invoices'],
    queryFn: () => getCustomers(1, { per_page: 1000 }),
  });

  const customerReceiptsQuery = useQuery({
    queryKey: ['customers-for-sales-receipts', debouncedReceiptSearchTerm],
    queryFn: () => getCustomers(1, { per_page: 1000, search: debouncedReceiptSearchTerm || undefined }),
    enabled: isReceiptModalOpen,
  });

  const salesInvoicesQuery = useQuery({
    queryKey: ['sales-invoices', currentPage, filters, searchTerm],
    queryFn: async () =>
      normalizeList(
        await getSalesInvoices(currentPage, {
          status: filters.status || undefined,
          customer_id: filters.customer_id || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          search: searchTerm || undefined,
        })
      ),
    keepPreviousData: true,
  });

  const customerPaymentsQuery = useQuery({
    queryKey: ['customer-payments', paymentsCurrentPage, searchTerm],
    queryFn: async () => {
      const res = await getAllCustomerPayments({ page: paymentsCurrentPage, per_page: 50, search: searchTerm || undefined });

      const normalized = normalizePaginatedResponse(res);
      let items = normalized.items;
      const customersForLookup = extractItems(customersQuery.data);
      let enriched = items.map((it) => {
        const customerName = it.customer_name ?? it.party_name ?? customersForLookup.find((c) => Number(c.id) === Number(it.party_id))?.name;
        return {
          ...it,
          customer_name: customerName,
          notes: it.notes ?? it.description ?? it.statement ?? it.note ?? it.raw?.notes ?? undefined,
          date: it.date ?? it.payment_date ?? it.transaction_date ?? undefined,
        };
      });

      return {
        items: enriched,
        meta: normalized.meta,
      };
    },
    enabled: activeTab === 'collections',
    keepPreviousData: true,
  });

  const paymentsTabList = customerPaymentsQuery.data?.items || [];
  const paymentsTabLoading = customerPaymentsQuery.isLoading;
  const paymentsMeta = customerPaymentsQuery.data?.meta || { page: 1, lastPage: 1, total: 0, perPage: 50 };

  const repsStatsQuery = useQuery({
    queryKey: ['sales-reps-stats'],
    queryFn: async () => {
      const res = await getSalesRepsStats();
      return res.data || [];
    },
    enabled: activeTab === 'reps_stats',
  });

  const invoiceDetailsQuery = useQuery({
    queryKey: ['sales-invoice-details', detailsInvoiceId],
    queryFn: async () => extractInvoicePayload(await getSalesInvoice(detailsInvoiceId)),
    enabled: Boolean(detailsInvoiceId),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => cancelSalesInvoice(id, { reason }),
    onSuccess: () => {
      toast.success('تم إلغاء الفاتورة بنجاح');
      setCancelInvoice(null);
      setCancelReason('');
      setCancelReasonError('');
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoice-details'] });
      queryClient.invalidateQueries({ queryKey: ['sales-reps-stats'] });
      queryClient.invalidateQueries({ queryKey: ['customers-statement'] });
    },
    onError: (error) => {
      const apiMessage =
        error?.response?.data?.errors?.reason?.[0] ||
        error?.response?.data?.message ||
        'تعذر إلغاء الفاتورة';
      setCancelReasonError(apiMessage);
      toast.error(apiMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const ok = window.confirm('هل أنت متأكد من الحذف النهائي للفاتورة؟ لا يمكن التراجع عن هذه العملية.');
      if (!ok) return Promise.reject(new Error('cancelled_by_user'));
      const { deleteSalesInvoice } = require('../../../api/salesInvoices');
      return deleteSalesInvoice(id);
    },
    onSuccess: (_, deletedId) => {
      toast.success('تم حذف الفاتورة نهائيًا');
      queryClient.setQueriesData({ queryKey: ['sales-invoices'] }, (currentData) => {
        if (!currentData) return currentData;

        const targetId = String(deletedId);

        if (Array.isArray(currentData)) {
          return currentData.filter((item) => String(item?.id) !== targetId);
        }

        if (Array.isArray(currentData?.items)) {
          const updatedItems = currentData.items.filter((item) => String(item?.id) !== targetId);
          const total = Number(currentData?.meta?.total ?? currentData?.total ?? updatedItems.length);
          return {
            ...currentData,
            items: updatedItems,
            meta: {
              ...(currentData?.meta || {}),
              total: Math.max(0, total - (updatedItems.length < currentData.items.length ? 1 : 0)),
            },
          };
        }

        if (currentData?.data && Array.isArray(currentData.data?.items)) {
          const updatedItems = currentData.data.items.filter((item) => String(item?.id) !== targetId);
          const total = Number(currentData?.data?.meta?.total ?? currentData?.data?.total ?? updatedItems.length);
          return {
            ...currentData,
            data: {
              ...currentData.data,
              items: updatedItems,
              meta: {
                ...(currentData.data?.meta || {}),
                total: Math.max(0, total - (updatedItems.length < currentData.data.items.length ? 1 : 0)),
              },
            },
          };
        }

        return currentData;
      });
      queryClient.removeQueries({ queryKey: ['sales-invoice-details', deletedId] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers-statement'] });
    },
    onError: (error) => {
      if (error.message === 'cancelled_by_user') return;
      const msg = error?.response?.data?.message || 'تعذر حذف الفاتورة';
      toast.error(msg);
    },
  });

  const customerReceiptMutation = useMutation({
    mutationFn: (data) => createCustomerPayment(data),
    onSuccess: () => {
      toast.success('تم تسجيل التحصيل بنجاح');
      setIsReceiptModalOpen(false);
      setReceiptSearchTerm('');
      setDebouncedReceiptSearchTerm('');
      resetReceiptForm({
        invoice_id: 0,
        party_id: 0,
        amount: '',
        notes: '',
        date: getTodayDate(),
        receipt_number: '',
      });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['sales-reps-stats'] });
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['customers-statement'] });
    },
    onError: () => toast.error('تعذر حفظ سند القبض'),
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedReceiptSearchTerm(receiptSearchTerm.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [receiptSearchTerm]);

  const handleSavePayment = async (payment) => {
    setEditingSaving(true);
    try {
      const payload = {
        amount: Number(payment.amount) || 0,
        transaction_date: payment.date || payment.payment_date || payment.transaction_date || undefined,
        description: payment.notes || payment.description || undefined,
        receipt_number: payment.receipt_number ?? payment.payment_number ?? undefined,
      };
      await updatePayment(payment.id, payload, payment.reference_type);
      toast.success('تم تعديل السند');
      setEditingPayment(null);
      setPaymentsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers-statement'] });
    } catch (e) {
      toast.error('فشل تعديل السند');
    } finally {
      setEditingSaving(false);
    }
  };

  const handleDeletePayment = async (payment) => {
    const ok = window.confirm('هل متأكد من حذف السند؟ لا يمكن التراجع');
    if (!ok) return;
    try {

      await deletePayment(payment.id, payment.reference_type);

      toast.success('تم حذف السند');

      queryClient.setQueriesData({ queryKey: ['customer-payments'] }, (currentData) => {
        if (!currentData) return currentData;
        const targetId = String(payment.id);

        if (Array.isArray(currentData)) {
          return currentData.filter((item) => String(item?.id) !== targetId);
        }

        if (Array.isArray(currentData?.items)) {
          const updatedItems = currentData.items.filter((item) => String(item?.id) !== targetId);
          const total = Number(currentData?.meta?.total ?? currentData?.total ?? updatedItems.length);
          return {
            ...currentData,
            items: updatedItems,
            meta: {
              ...(currentData?.meta || {}),
              total: Math.max(0, total - (updatedItems.length < currentData.items.length ? 1 : 0)),
            },
          };
        }

        if (currentData?.data && Array.isArray(currentData.data?.items)) {
          const updatedItems = currentData.data.items.filter((item) => String(item?.id) !== targetId);
          const total = Number(currentData?.data?.meta?.total ?? currentData?.data?.total ?? updatedItems.length);
          return {
            ...currentData,
            data: {
              ...currentData.data,
              items: updatedItems,
              meta: {
                ...(currentData.data?.meta || {}),
                total: Math.max(0, total - (updatedItems.length < currentData.data.items.length ? 1 : 0)),
              },
            },
          };
        }

        return currentData;
      });

      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers-statement'] });
    } catch (e) {
      toast.error('فشل حذف السند');
    }
  };

  const invoices = salesInvoicesQuery.data?.items || [];
  const meta = salesInvoicesQuery.data?.meta || { page: 1, lastPage: 1, total: 0, perPage: SALES_INVOICES_PER_PAGE };
  const customers = extractItems(customersQuery.data);
  const customersForReceipt = extractItems(customerReceiptsQuery.data);
  const statusOptions = getStatusOptions();
  const selectedCustomerId = Number(watchReceipt('party_id')) || 0;
  const selectedCustomer = customersForReceipt.find((customer) => Number(customer.id) === selectedCustomerId);

  const onSubmitCustomerReceipt = (values) => {
    customerReceiptMutation.mutate(values);
  };

  const columns = useMemo(
    () => [
      {
        key: 'number',
        label: 'رقم الفاتورة',
        render: (_, row) => (
          <span className="font-mono font-bold text-text">{getInvoiceNumber(row)}</span>
        ),
      },
      {
        key: 'customer',
        label: 'العميل',
        render: (_, row) => getCustomerName(row),
      },
      {
        key: 'total',
        label: 'الإجمالي',
        render: (value, row) => formatCurrency(value ?? getInvoiceAmount(row, 'total')),
      },
      {
        key: 'paid',
        label: 'المدفوع',
        render: (value, row) => formatCurrency(value ?? getInvoiceAmount(row, 'paid')),
      },
      {
        key: 'remaining',
        label: 'المتبقي',
        render: (value, row) => {
          const remaining = Number(value ?? getInvoiceAmount(row, 'remaining'));
          return <span className={remaining > 0 ? 'font-semibold text-danger' : ''}>{formatCurrency(remaining)}</span>;
        },
      },
      {
        key: 'status',
        label: 'الحالة',
        render: (value) => <StatusBadge status={value || 'confirmed'} />,
      },
      {
        key: 'sales_rep_name',
        label: 'المندوب',
        render: (value) => <span className="text-text-muted text-sm">{value || '—'}</span>,
      },
      {
        key: 'date',
        label: 'التاريخ',
        render: (value, row) => {
          const dateValue = value || getInvoiceDate(row);
          return dateValue ? formatDate(dateValue) : '—';
        },
      },
      {
        key: 'actions',
        label: 'إجراءات',
        render: (_, row) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDetailsInvoiceId(row.id)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
              title="عرض"
            >
              <Eye className="h-4 w-4" />
            </button>

            {row?.status === 'confirmed' ? (
              <Link
                to={`/store/sales-invoices/${row.id}/edit`}
                className="rounded-md p-2 text-primary hover:bg-primary/10"
                title="تعديل"
              >
                <Edit className="h-4 w-4" />
              </Link>
            ) : null}

            {row?.status === 'confirmed' ? (
              <button
                type="button"
                onClick={() => {
                  setCancelInvoice(row);
                  setCancelReason('');
                  setCancelReasonError('');
                }}
                className="rounded-md p-2 text-red-600 hover:bg-red-50"
                title="إلغاء"
              >
                <XCircle className="h-4 w-4" />
              </button>
            ) : null}
            {row?.status === 'cancelled' ? (
              <button
                type="button"
                onClick={() => deleteMutation.mutate(row.id)}
                className="rounded-md p-2 text-danger hover:bg-red-50"
                title="حذف نهائي"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    []
  );

  const collectionColumns = useMemo(() => {
    const base = columns.filter((c) => c.key !== 'actions');
    base.push({
      key: 'collect',
      label: 'إجراءات',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const cid = getCustomerId(row);
              setReceiptValue('party_id', cid);
              setReceiptValue('invoice_id', row.id);
              setIsReceiptModalOpen(true);
            }}
            className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50"
            title="تحصيل"
          >
            <HandCoins className="h-4 w-4" />
          </button>
        </div>
      ),
    });

    return base;
  }, [columns]);

  const repColumns = useMemo(
    () => [
      {
        key: 'sales_rep_name',
        label: 'اسم المهندس / المندوب',
        render: (value) => <span className="font-semibold text-text">{value}</span>,
      },
      {
        key: 'customers_count',
        label: 'عدد العملاء',
        render: (value) => <span>{(value ?? 0).toLocaleString('ar-EG')}</span>,
      },
      {
        key: 'sales_amount',
        label: 'إجمالي المبيعات',
        render: (value) => <span className="font-semibold">{formatCurrency(value ?? 0)}</span>,
      },
      {
        key: 'collected_amount',
        label: 'إجمالي التحصيلات',
        render: (value, row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-emerald-600">{formatCurrency(value ?? 0)}</span>
            <span className="text-[10px] text-text-muted">
              (منها فواتير: {formatCurrency(row.invoice_collected ?? 0)} / سندات: {formatCurrency(row.receipt_collected ?? 0)})
            </span>
          </div>
        ),
      },
    ],
    []
  );

  const detailsInvoice = invoiceDetailsQuery.data || {};
  const detailItems = Array.isArray(detailsInvoice?.items) ? detailsInvoice.items : [];

  const detailsColumns = [
    {
      key: 'product',
      label: 'المنتج',
      render: (_, row) => row?.product?.name || row?.product_name || '—',
    },
    {
      key: 'quantity',
      label: 'الكمية',
      render: (value) => Number(value ?? 0).toLocaleString('ar-EG'),
    },
    {
      key: 'unit_price',
      label: 'السعر',
      render: (value) => formatCurrency(value ?? 0),
    },
    {
      key: 'line_total',
      label: 'الإجمالي',
      render: (_, row) => formatCurrency((Number(row?.quantity) || 0) * (Number(row?.unit_price) || 0)),
    },
  ];

  const onCancelConfirm = () => {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelReasonError('سبب الإلغاء مطلوب');
      return;
    }

    cancelMutation.mutate({ id: cancelInvoice.id, reason });
  };

  return (
    <div>
      <PageHeader
        title="فواتير البيع"
        subtitle="إدارة ومراجعة فواتير البيع"
        actions={
          activeTab === 'invoices' ? (
            <div className="flex flex-col gap-2 sm:flex-row w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-2 justify-center w-full sm:w-auto"
                onClick={() => setIsReceiptModalOpen(true)}
              >
                <HandCoins className="h-4 w-4" />
                <span>تحصيل من عميل</span>
              </Button>

              <Link to="/store/sales-invoices/create" className="w-full sm:w-auto">
                <Button type="button" className="flex items-center gap-2 justify-center w-full">
                  <Plus className="h-4 w-4" />
                  <span>فاتورة جديدة</span>
                </Button>
              </Link>
            </div>
          ) : null
        }
      />

      <div className="mb-4 flex w-full sm:w-fit overflow-hidden rounded-lg border border-border bg-white">
        {[
          { key: 'invoices', label: 'فواتير البيع' },
          { key: 'collections', label: 'تحصيلات' },
          { key: 'returns', label: 'مرتجعات البيع' },
          { key: 'reps_stats', label: 'تقرير المهندسين / المناديب' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 sm:flex-initial border-l border-border px-4 py-2 text-sm font-medium transition-colors first:border-l-0 ${activeTab === tab.key ? 'bg-primary text-white' : 'text-text hover:bg-slate-50'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' && (
        <>
          <div className="mb-4 grid gap-3 rounded-xl border border-border bg-white p-3 md:grid-cols-5">
            <div className="relative md:col-span-1">
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setCurrentPage(1);
                  setSearchTerm(e.target.value);
                }}
                placeholder="بحث برقم الفاتورة..."
                className="pr-9"
              />
            </div>


          </div>

          {salesInvoicesQuery.isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Desktop view */}
              <div className="hidden md:block">
                <DataTable
                  columns={columns}
                  data={invoices}
                  loading={salesInvoicesQuery.isFetching}
                  emptyMessage="لا توجد فواتير بيع"
                />
              </div>

              {/* Mobile view */}
              <div className="block md:hidden space-y-3">
                {invoices.length === 0 ? (
                  <div className="rounded-xl border border-border bg-white p-8 text-center text-text-muted">
                    لا توجد فواتير بيع
                  </div>
                ) : (
                  invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-text">
                          {getInvoiceNumber(invoice)}
                        </span>
                        <StatusBadge status={invoice.status || 'confirmed'} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-text-muted">العميل:</div>
                        <div className="font-medium text-text text-left">
                          {getCustomerName(invoice)}
                        </div>

                        <div className="text-text-muted">التاريخ:</div>
                        <div className="text-text text-left font-mono">
                          {getInvoiceDate(invoice) ? formatDate(getInvoiceDate(invoice)) : '—'}
                        </div>
                      </div>

                      <hr className="border-border" />

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <div className="text-text-muted mb-1">الإجمالي</div>
                          <div className="font-semibold text-text">
                            {formatCurrency(getInvoiceAmount(invoice, 'total'))}
                          </div>
                        </div>
                        <div className="rounded-lg bg-emerald-50/50 p-2 text-emerald-800">
                          <div className="text-emerald-600 mb-1">المدفوع</div>
                          <div className="font-semibold">
                            {formatCurrency(getInvoiceAmount(invoice, 'paid'))}
                          </div>
                        </div>
                        <div className="rounded-lg bg-red-50/50 p-2 text-red-800">
                          <div className="text-red-600 mb-1">المتبقي</div>
                          <div className="font-semibold">
                            {formatCurrency(getInvoiceAmount(invoice, 'remaining'))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setDetailsInvoiceId(invoice.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors h-9"
                        >
                          <Eye className="h-4 w-4" />
                          <span>عرض التفاصيل</span>
                        </button>

                        {invoice?.status === 'confirmed' ? (
                          <Link
                            to={`/store/sales-invoices/${invoice.id}/edit`}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors h-9"
                          >
                            <Edit className="h-4 w-4" />
                            <span>تعديل</span>
                          </Link>
                        ) : null}

                        {invoice?.status === 'confirmed' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelInvoice(invoice);
                              setCancelReason('');
                              setCancelReasonError('');
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors h-9"
                          >
                            <XCircle className="h-4 w-4" />
                            <span>إلغاء الفاتورة</span>
                          </button>
                        ) : null}
                        {invoice?.status === 'cancelled' ? (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(invoice.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-danger hover:bg-red-50 hover:text-red-700 transition-colors h-9"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>حذف نهائي</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <Pagination
            currentPage={meta.page}
            lastPage={meta.lastPage}
            total={meta.total}
            perPage={meta.perPage}
            itemLabel="فاتورة"
            onPageChange={(nextPage) => {
              if (nextPage < 1 || nextPage > meta.lastPage) return;
              setCurrentPage(nextPage);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            isLoading={salesInvoicesQuery.isFetching}
          />

          <Dialog open={Boolean(detailsInvoiceId)} onOpenChange={(open) => (!open ? setDetailsInvoiceId(null) : null)}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>تفاصيل فاتورة البيع</DialogTitle>
                <DialogDescription>
                  {invoiceDetailsQuery.isLoading
                    ? 'جاري تحميل التفاصيل...'
                    : `رقم الفاتورة: ${detailsInvoice?.invoice_number || detailsInvoiceId || '—'}`}
                </DialogDescription>
              </DialogHeader>

              {invoiceDetailsQuery.isLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-lg border border-border bg-slate-50 p-4 text-sm text-text-muted">
                    <div>العميل: <span className="font-semibold text-text">{detailsInvoice?.customer?.name || detailsInvoice?.customer_name || '—'}</span></div>
                    <div className="flex items-center gap-1.5">الحالة: <StatusBadge status={detailsInvoice?.status || 'confirmed'} /></div>
                    <div>الإجمالي: <span className="font-semibold text-text">{formatCurrency(detailsInvoice?.total_amount || detailsInvoice?.total || 0)}</span></div>
                    <div>المدفوع: <span className="font-semibold text-emerald-600">{formatCurrency(detailsInvoice?.paid_amount || 0)}</span></div>
                    <div>المتبقي: <span className="font-semibold text-danger">{formatCurrency(detailsInvoice?.remaining_amount || 0)}</span></div>
                    {detailsInvoice?.sales_rep_name ? (
                      <div>المندوب: <span className="font-semibold text-text">{detailsInvoice.sales_rep_name}</span></div>
                    ) : null}
                  </div>

                  {/* Desktop Items Table */}
                  <div className="hidden sm:block">
                    <DataTable columns={detailsColumns} data={detailItems} loading={false} emptyMessage="لا توجد بنود" />
                  </div>

                  {/* Mobile Items List */}
                  <div className="block sm:hidden space-y-2">
                    <div className="text-xs font-semibold text-text-muted mb-1">البنود:</div>
                    {detailItems.length === 0 ? (
                      <div className="text-center py-4 text-xs text-text-muted border border-dashed rounded-lg bg-white">لا توجد بنود</div>
                    ) : (
                      detailItems.map((item, index) => (
                        <div key={index} className="rounded-lg border border-border bg-white p-3 space-y-1.5 text-xs shadow-sm">
                          <div className="flex justify-between font-semibold">
                            <span>{item?.product?.name || item?.product_name || '—'}</span>
                            <span>{formatCurrency((Number(item?.quantity) || 0) * (Number(item?.unit_price) || 0))}</span>
                          </div>
                          <div className="flex justify-between text-text-muted">
                            <span>الكمية: {Number(item?.quantity ?? 0).toLocaleString('ar-EG')}</span>
                            <span>السعر: {formatCurrency(item?.unit_price ?? 0)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={isReceiptModalOpen}
            onOpenChange={(open) => {
              setIsReceiptModalOpen(open);

              if (!open) {
                setReceiptSearchTerm('');
                setDebouncedReceiptSearchTerm('');
                resetReceiptForm({
                  invoice_id: 0,
                  party_id: 0,
                  amount: '',
                  notes: '',
                  date: getTodayDate(),
                  receipt_number: '',
                });
              }
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <HandCoins className="h-5 w-5 text-green-600" />
                  <span>سند قبض — تحصيل من عميل</span>
                </DialogTitle>
                <DialogDescription>سجّل تحصيل نقدي من  عميل</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleReceiptSubmit(onSubmitCustomerReceipt)} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">العميل *</label>

                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <Input
                      value={receiptSearchTerm}
                      onChange={(event) => {
                        setReceiptSearchTerm(event.target.value);
                        setReceiptValue('party_id', 0);
                      }}
                      placeholder="ابحث عن عميل..."
                      className="pr-9"
                    />
                  </div>

                  {customerReceiptsQuery.isLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <select
                      {...registerReceipt('party_id')}
                      className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text"
                    >
                      <option value={0}>اختر عميلًا</option>
                      {customersForReceipt.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedCustomer ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-text-muted">
                      {selectedCustomer.name} — الرصيد: <BalanceDisplay balance={Number(selectedCustomer.balance) || 0} />
                    </div>
                  ) : null}

                  {receiptErrors.party_id ? <p className="text-sm text-danger">{receiptErrors.party_id.message}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text">المبلغ *</label>
                    <Input type="number" min="0" step="0.01" {...registerReceipt('amount')} />
                    {receiptErrors.amount ? <p className="text-sm text-danger">{receiptErrors.amount.message}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text">التاريخ</label>
                    <Input type="date" {...registerReceipt('date')} />
                    {receiptErrors.date ? <p className="text-sm text-danger">{receiptErrors.date.message}</p> : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">رقم فاتورة التحصيل</label>
                  <Input {...registerReceipt('receipt_number')} placeholder="مثال: RCP-001" dir="ltr" />
                  <p className="text-xs text-text-muted">اختياري — رقم السند أو الإيصال</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">الملاحظات</label>
                  <Input {...registerReceipt('notes')} placeholder="ملاحظات إضافية" />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsReceiptModalOpen(false)}
                    disabled={customerReceiptMutation.isPending}
                  >
                    إغلاق
                  </Button>

                  <Button type="submit" disabled={customerReceiptMutation.isPending}>
                    {customerReceiptMutation.isPending ? 'جاري الحفظ...' : '💾 حفظ سند القبض'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(cancelInvoice)}
            onOpenChange={(open) => {
              if (!open) {
                setCancelInvoice(null);
                setCancelReason('');
                setCancelReasonError('');
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إلغاء الفاتورة رقم {cancelInvoice?.invoice_number || `INV-${cancelInvoice?.id || ''}`}</DialogTitle>
                <DialogDescription>سيتم عكس المخزون والقيود المالية</DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">سبب الإلغاء *</label>
                <textarea
                  value={cancelReason}
                  onChange={(event) => {
                    setCancelReason(event.target.value);
                    if (cancelReasonError) setCancelReasonError('');
                  }}
                  rows={4}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="اكتب سبب الإلغاء"
                />
                {cancelReasonError ? <p className="text-sm text-danger">{cancelReasonError}</p> : null}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCancelInvoice(null);
                    setCancelReason('');
                    setCancelReasonError('');
                  }}
                  disabled={cancelMutation.isPending}
                >
                  إلغاء
                </Button>

                <Button
                  type="button"
                  onClick={onCancelConfirm}
                  disabled={cancelMutation.isPending}
                  className="bg-danger text-white hover:bg-red-700 focus-visible:ring-danger"
                >
                  {cancelMutation.isPending ? 'جاري التنفيذ...' : 'تأكيد الإلغاء'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'collections' && (
        <>
          <div className="mb-4 grid gap-3 rounded-xl border border-border bg-white p-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setPaymentsCurrentPage(1);
                  setSearchTerm(e.target.value);
                }}
                placeholder="بحث برقم السند..."
                className="pr-9"
              />
            </div>
          </div>

          {paymentsTabLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable
                  columns={[
                    { key: 'receipt', label: 'رقم السند', render: (_, row) => row.receipt_number ?? row.payment_number ?? row.id },
                    { key: 'date', label: 'التاريخ', render: (value, row) => row.date ?? row.payment_date ?? '—' },
                    { key: 'amount', label: 'المبلغ', render: (value, row) => formatCurrency(row.amount ?? row.debit ?? row.credit ?? 0) },
                    { key: 'customer_name', label: 'العميل', render: (value, row) => row.customer_name ?? row.party_name ?? row.customer?.name ?? row.party?.name ?? '—' },

                    { key: 'desc', label: 'البيان', render: (value, row) => row.notes ?? row.description ?? row.statement ?? row.note ?? row.raw?.notes ?? '—' },
                    {
                      key: 'actions', label: 'إجراءات', render: (_, row) => (
                        <div className="flex items-center gap-2">
                          <button type="button" className="rounded-md p-2 text-primary hover:bg-primary/10" title="تعديل" onClick={() => { setEditingPayment(row); setPaymentsModalOpen(true); }}>
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" className="rounded-md p-2 text-danger hover:bg-red-50" title="حذف" onClick={() => handleDeletePayment(row)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    },
                  ]}
                  data={paymentsTabList}
                  loading={paymentsTabLoading}
                  emptyMessage="لا توجد تحصيلات"
                />
              </div>

              <div className="block md:hidden space-y-3">
                {paymentsTabLoading ? (
                  <LoadingSpinner />
                ) : paymentsTabList.length === 0 ? (
                  <div className="rounded-xl border border-border bg-white p-8 text-center text-text-muted">لا توجد تحصيلات</div>
                ) : (
                  paymentsTabList.map((p) => (
                    <div key={p.id} className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-text">{p.receipt_number ?? p.payment_number ?? p.id}</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => { setEditingPayment(p); setPaymentsModalOpen(true); }} className="rounded-md p-2 text-primary hover:bg-primary/10"><Edit className="h-4 w-4" /></button>
                          <button type="button" onClick={() => handleDeletePayment(p)} className="rounded-md p-2 text-danger hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="text-sm text-text-muted">{p.date ?? p.payment_date ?? p.transaction_date ?? '—'}</div>
                      <div className="text-lg font-semibold">{formatCurrency(p.amount ?? p.debit ?? p.credit ?? 0)}</div>
                      <div className="text-sm text-text-muted">{p.customer_name}</div>
                      <div className="text-sm text-text-muted">{p.description}</div>
                    </div>
                  ))
                )}
              </div>

              <Pagination
                currentPage={paymentsMeta.page}
                lastPage={paymentsMeta.lastPage}
                total={paymentsMeta.total}
                perPage={paymentsMeta.perPage}
                itemLabel="سند تحصيل"
                onPageChange={(nextPage) => {
                  if (nextPage < 1 || nextPage > paymentsMeta.lastPage) return;
                  setPaymentsCurrentPage(nextPage);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                isLoading={customerPaymentsQuery.isFetching}
              />
            </>
          )}
        </>
      )}

      <Dialog open={paymentsModalOpen} onOpenChange={(open) => { if (!open) { setPaymentsModalOpen(false); setEditingPayment(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل سند التحصيل</DialogTitle>
            <DialogDescription>عدّل تفاصيل السند ثم احفظ</DialogDescription>
          </DialogHeader>

          {editingPayment ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">المبلغ</label>
                  <Input type="number" value={editingPayment.amount ?? editingPayment.debit ?? editingPayment.credit ?? 0} onChange={(e) => setEditingPayment((s) => ({ ...s, amount: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">التاريخ</label>
                  <Input type="date" value={editingPayment.payment_date ?? ''} onChange={(e) => setEditingPayment((s) => ({ ...s, date: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">الاسم</label>
                  <Input type="text" value={editingPayment.party_name ?? ''} onChange={(e) => setEditingPayment((s) => ({ ...s, party_name: e.target.value }))} />
                </div>

              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">رقم السند</label>
                <Input value={editingPayment.receipt_number ?? editingPayment.payment_number ?? ''} onChange={(e) => setEditingPayment((s) => ({ ...s, receipt_number: e.target.value }))} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">الملاحظات</label>
                <Input value={editingPayment.notes ?? editingPayment.description ?? ''} onChange={(e) => setEditingPayment((s) => ({ ...s, notes: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setPaymentsModalOpen(false); setEditingPayment(null); }} disabled={editingSaving}>إلغاء</Button>
                <Button type="button" onClick={() => handleSavePayment(editingPayment)} disabled={editingSaving}>{editingSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {activeTab === 'returns' && (
        <SalesReturnsTab />
      )}

      {activeTab === 'reps_stats' && (
        <div className="space-y-4">
          {repsStatsQuery.isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Desktop view */}
              <div className="hidden md:block">
                <DataTable
                  columns={repColumns}
                  data={repsStatsQuery.data || []}
                  loading={repsStatsQuery.isFetching}
                  emptyMessage="لا توجد بيانات للمهندسين أو المناديب"
                />
              </div>

              {/* Mobile view */}
              <div className="block md:hidden space-y-3">
                {(repsStatsQuery.data || []).length === 0 ? (
                  <div className="rounded-xl border border-border bg-white p-8 text-center text-text-muted">
                    لا توجد بيانات للمهندسين أو المناديب
                  </div>
                ) : (
                  (repsStatsQuery.data || []).map((rep, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-text">
                          {rep.sales_rep_name}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-text-muted">عدد العملاء:</div>
                        <div className="font-medium text-text text-left">
                          {(rep.customers_count ?? 0).toLocaleString('ar-EG')}
                        </div>

                        <div className="text-text-muted">إجمالي المبيعات:</div>
                        <div className="font-medium text-text text-left font-mono">
                          {formatCurrency(rep.sales_amount ?? 0)}
                        </div>

                        <div className="text-text-muted">إجمالي التحصيلات:</div>
                        <div className="font-medium text-emerald-600 text-left font-mono">
                          {formatCurrency(rep.collected_amount ?? 0)}
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-2 text-center text-[10px] text-text-muted">
                        منها فواتير: {formatCurrency(rep.invoice_collected ?? 0)} | سندات: {formatCurrency(rep.receipt_collected ?? 0)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
