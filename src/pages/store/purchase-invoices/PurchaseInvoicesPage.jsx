import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanknoteArrowDown, Eye, Plus, Search, XCircle, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createSupplierPayment, getAllSupplierPayments, updatePayment, deletePayment } from '../../../api/payments';
import { cancelPurchaseInvoice, getPurchaseInvoices } from '../../../api/purchaseInvoices';
import { getSuppliers } from '../../../api/suppliers';
import BalanceDisplay from '../../../components/shared/BalanceDisplay';
import DataTable from '../../../components/shared/DataTable';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import Pagination from '../../../components/shared/Pagination';
import StatusBadge from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { normalizePaginatedResponse } from '../../../utils/pagination';
import PurchaseReturnsTab from './PurchaseReturnsTab';

const supplierPaymentSchema = z.object({
  invoice_id: z.coerce.number().optional(),
  party_id: z.coerce.number().min(1, 'المورد مطلوب'),
  amount: z.coerce.number().min(0.01, 'المبلغ يجب أن يكون أكبر من صفر'),
  notes: z.string().optional(),
  date: z.string().min(1, 'التاريخ مطلوب'),
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
  if (Array.isArray(payload?.suppliers)) return payload.suppliers;
  if (Array.isArray(payload)) return payload;
  return [];
};

const PURCHASE_INVOICES_PER_PAGE = 10;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getInvoiceDate = (invoice) => invoice?.invoice_date || invoice?.date || invoice?.sort_date || invoice?.created_at || null;
const getInvoiceNumber = (invoice) => invoice?.invoice_number || invoice?.number || `#${invoice?.id}`;
const getSupplierName = (invoice) =>
  invoice?.supplier?.name || invoice?.supplier_name || invoice?.vendor?.name || invoice?.vendor_name || '—';
const getInvoiceAmount = (invoice, key) => {
  if (key === 'paid') {
    return toNumber(invoice?.paid_amount ?? invoice?.paid ?? 0);
  }
  return toNumber(invoice?.total_amount ?? invoice?.total ?? invoice?.grand_total ?? invoice?.amount ?? 0);
};

const getInvoiceRemaining = (invoice) => getInvoiceAmount(invoice, 'total') - getInvoiceAmount(invoice, 'paid');

const getSupplierId = (invoice) => invoice?.supplier?.id || invoice?.supplier_id || invoice?.vendor?.id || invoice?.vendor_id || 0;

const normalizeList = (response) => {
  const normalized = normalizePaginatedResponse(response);
  const raw = response?.data ?? {};
  const payload = normalized.payload || {};
  const paginationSource = payload?.pagination || raw?.pagination;

  const meta = paginationSource
    ? {
      page: Math.max(1, toNumber(paginationSource?.current_page ?? paginationSource?.page, normalized.meta.page)),
      perPage: Math.max(
        1,
        toNumber(paginationSource?.per_page ?? paginationSource?.perPage, PURCHASE_INVOICES_PER_PAGE)
      ),
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
    items: normalized.items,
    meta,
    payload,
  };
};

export default function PurchaseInvoicesPage() {

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('invoices');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cancellingInvoice, setCancellingInvoice] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');
  const [isSupplierPaymentModalOpen, setIsSupplierPaymentModalOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [debouncedSupplierSearchTerm, setDebouncedSupplierSearchTerm] = useState('');
  const [paymentsTabList, setPaymentsTabList] = useState([]);
  const [paymentsTabLoading, setPaymentsTabLoading] = useState(false);
  const [paymentsModalOpen, setPaymentsModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingSaving, setEditingSaving] = useState(false);

  const {
    register: registerSupplierPayment,
    handleSubmit: handleSupplierPaymentSubmit,
    reset: resetSupplierPaymentForm,
    setValue: setSupplierPaymentValue,
    watch: watchSupplierPayment,
    formState: { errors: supplierPaymentErrors },
  } = useForm({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      invoice_id: 0,
      party_id: 0,
      amount: '',
      notes: '',
      date: getTodayDate(),
    },
  });

  const purchaseInvoicesQuery = useQuery({
    queryKey: ['purchase-invoices', currentPage, searchTerm, statusFilter],
    queryFn: async () =>
      normalizeList(
        await getPurchaseInvoices(currentPage, {
          search: searchTerm || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        })
      ),
    keepPreviousData: true,
  });

  const suppliersForPaymentsQuery = useQuery({
    queryKey: ['suppliers-for-purchase-payments', debouncedSupplierSearchTerm],
    queryFn: () => getSuppliers(1, { per_page: 1000, search: debouncedSupplierSearchTerm || undefined }),
    enabled: isSupplierPaymentModalOpen,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => cancelPurchaseInvoice(id, { reason }),
    onSuccess: () => {
      toast.success('تم إلغاء الفاتورة بنجاح');
      setCancellingInvoice(null);
      setCancelReason('');
      setCancelReasonError('');
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
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
    mutationFn: (id) => {
      // lazy-load API to avoid circular imports at module init
      const { deletePurchaseInvoice } = require('../../../api/purchaseInvoices');
      return deletePurchaseInvoice(id);
    },
    onSuccess: () => {
      toast.success('تم حذف الفاتورة نهائيًا');
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
    onError: (error) => {
      const msg = error?.response?.data?.message || 'تعذر حذف الفاتورة';
      toast.error(msg);
    },
  });

  const supplierPaymentMutation = useMutation({
    mutationFn: (data) => createSupplierPayment(data),
    onSuccess: () => {
      toast.success('تم تسجيل الدفع بنجاح');
      setIsSupplierPaymentModalOpen(false);
      setSupplierSearchTerm('');
      setDebouncedSupplierSearchTerm('');
      resetSupplierPaymentForm({
        invoice_id: 0,
        party_id: 0,
        amount: '',
        notes: '',
        date: getTodayDate(),
      });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
    },
    onError: () => toast.error('تعذر حفظ سند الصرف'),
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSupplierSearchTerm(supplierSearchTerm.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [supplierSearchTerm]);

  // load all supplier payments when Payments tab active
  useEffect(() => {
    if (activeTab !== 'payments') {
      setPaymentsTabList([]);
      return;
    }

    let mounted = true;
    (async () => {
      setPaymentsTabLoading(true);
      try {
        const res = await getAllSupplierPayments();
        const payload = res?.data?.data ?? res?.data ?? [];
        const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        // try to resolve supplier names by fetching suppliers list
        let suppliersForLookup = [];
        try {
          const sres = await getSuppliers(1, { per_page: 1000 });
          const spayload = sres?.data?.data ?? sres?.data ?? [];
          suppliersForLookup = Array.isArray(spayload?.data) ? spayload.data : Array.isArray(spayload) ? spayload : [];
        } catch (err) {
          suppliersForLookup = [];
        }

        const enriched = items.map((it) => ({
          ...it,
          supplier_name: it.supplier_name ?? it.party_name ?? suppliersForLookup.find((s) => Number(s.id) === Number(it.party_id))?.name,
          notes: it.notes ?? it.description ?? it.statement ?? it.note ?? it.raw?.notes ?? undefined,
          date: it.date ?? it.payment_date ?? it.transaction_date ?? undefined,
        }));
        if (mounted) setPaymentsTabList(enriched);
      } catch (e) {
        toast.error('تعذر جلب سندات الموردين');
        if (mounted) setPaymentsTabList([]);
      } finally {
        if (mounted) setPaymentsTabLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const onCancelConfirm = () => {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelReasonError('يرجى تقديم سبب لإلغاء الفاتورة.');
      return;
    }

    cancelMutation.mutate({ id: cancellingInvoice.id, reason });
  };

  const invoices = purchaseInvoicesQuery.data?.items || [];
  const meta = purchaseInvoicesQuery.data?.meta || { page: 1, lastPage: 1, total: 0, perPage: PURCHASE_INVOICES_PER_PAGE };
  const suppliersForPayments = extractItems(suppliersForPaymentsQuery.data);
  const selectedSupplierId = Number(watchSupplierPayment('party_id')) || 0;
  const selectedSupplier = suppliersForPayments.find((supplier) => Number(supplier.id) === selectedSupplierId);

  const onSubmitSupplierPayment = (values) => {
    supplierPaymentMutation.mutate(values);
  };

  const handleSavePayment = async (payment) => {
    setEditingSaving(true);
    try {
      const payload = {
        amount: Number(payment.amount) || 0,
        description: payment.notes ?? payment.description ?? undefined,
        receipt_number: payment.receipt_number ?? payment.receiptNumber ?? undefined,
        transaction_date: payment.date || payment.transaction_date || undefined,
      };
      await updatePayment(payment.id, payload);
      toast.success('تم تعديل السند');
      setEditingPayment(null);
      // refresh list
      const res = await getAllSupplierPayments();
      const payloadRes = res?.data?.data ?? res?.data ?? [];
      const items = Array.isArray(payloadRes?.data) ? payloadRes.data : Array.isArray(payloadRes) ? payloadRes : [];
      let suppliersForLookup = [];
      try {
        const sres = await getSuppliers(1, { per_page: 1000 });
        const spayload = sres?.data?.data ?? sres?.data ?? [];
        suppliersForLookup = Array.isArray(spayload?.data) ? spayload.data : Array.isArray(spayload) ? spayload : [];
      } catch (err) {
        suppliersForLookup = [];
      }
      const enriched = items.map((it) => ({
        ...it,
        supplier_name: it.supplier_name ?? it.party_name ?? suppliersForLookup.find((s) => Number(s.id) === Number(it.party_id))?.name,
        notes: it.notes ?? it.description ?? it.statement ?? it.note ?? it.raw?.notes ?? undefined,
        date: it.date ?? it.payment_date ?? it.transaction_date ?? undefined,
      }));
      setPaymentsTabList(enriched);
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
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
      await deletePayment(payment.id);
      toast.success('تم حذف السند');
      // refresh list
      const res = await getAllSupplierPayments();
      const payloadRes = res?.data?.data ?? res?.data ?? [];
      const items = Array.isArray(payloadRes?.data) ? payloadRes.data : Array.isArray(payloadRes) ? payloadRes : [];
      let suppliersForLookup = [];
      try {
        const sres = await getSuppliers(1, { per_page: 1000 });
        const spayload = sres?.data?.data ?? sres?.data ?? [];
        suppliersForLookup = Array.isArray(spayload?.data) ? spayload.data : Array.isArray(spayload) ? spayload : [];
      } catch (err) {
        suppliersForLookup = [];
      }
      const enriched = items.map((it) => ({
        ...it,
        supplier_name: it.supplier_name ?? it.party_name ?? suppliersForLookup.find((s) => Number(s.id) === Number(it.party_id))?.name,
        notes: it.notes ?? it.description ?? it.statement ?? it.note ?? it.raw?.notes ?? undefined,
      }));
      setPaymentsTabList(enriched);
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
    } catch (e) {
      toast.error('فشل حذف السند');
    }
  };

  const columns = useMemo(() => [
    {
      key: 'number',
      label: 'رقم الفاتورة',
      render: (_, row) => getInvoiceNumber(row),
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
      key: 'supplier',
      label: 'المورد',
      render: (_, row) => getSupplierName(row),
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
      key: 'status',
      label: 'الحالة',
      render: (value) => <StatusBadge status={value || 'confirmed'} />,
    },
    {
      key: 'actions',
      label: 'إجراءات',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Link
            to={`/store/purchase-invoices/${row.id}`}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            title="عرض"
          >
            <Eye className="h-4 w-4" />
          </Link>

          {row?.status === 'confirmed' ? (
            <Link
              to={`/store/purchase-invoices/${row.id}/edit`}
              className="rounded-md p-2 text-primary hover:bg-primary/10"
              title="تعديل"
            >
              <Edit className="h-4 w-4" />
            </Link>
          ) : null}

          {row?.status !== 'cancelled' ? (
            <button
              type="button"
              onClick={() => {
                setCancellingInvoice(row);
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
  ], []);

  const paymentsColumns = useMemo(() => {
    const base = columns.filter((c) => c.key !== 'actions');
    base.push({
      key: 'pay',
      label: 'إجراءات',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const sid = getSupplierId(row);
              setSupplierPaymentValue('party_id', sid);
              setSupplierPaymentValue('invoice_id', row.id);
              setIsSupplierPaymentModalOpen(true);
            }}
            className="rounded-md p-2 text-amber-700 hover:bg-amber-50"
            title="سداد"
          >
            <BanknoteArrowDown className="h-4 w-4" />
          </button>
        </div>
      ),
    });

    return base;
  }, [columns]);

  const supplierPaymentsColumns = [
    { key: 'receipt', label: 'رقم السند', render: (_, row) => row.receipt_number ?? row.payment_number ?? row.id },
    { key: 'date', label: 'التاريخ', render: (value, row) => row.payment_date ?? row.date ?? row.transaction_date ?? row.created_at ?? '—' },
    { key: 'amount', label: 'المبلغ', render: (value, row) => formatCurrency(row.amount ?? row.debit ?? row.credit ?? 0) },
    { key: 'desc', label: 'البيان', render: (value, row) => row.notes ?? row.description ?? row.statement ?? row.note ?? row.raw?.notes ?? '—' },
    {
      key: 'actions', label: 'إجراءات', render: (_, row) => (
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-md p-2 text-primary hover:bg-primary/10" title="تعديل" onClick={() => { setPaymentsModalOpen(true); setPaymentsTabList((prev) => prev); setEditingPayment(row); }}>
            <Edit className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-md p-2 text-danger hover:bg-red-50" title="حذف" onClick={() => handleDeletePayment(row)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="فواتير الشراء"
        subtitle="إدارة ومراجعة فواتير الشراء"
        actions={
          activeTab === 'invoices' ? (
            <div className="flex flex-col gap-2 sm:flex-row w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-2 justify-center w-full sm:w-auto"
                onClick={() => setIsSupplierPaymentModalOpen(true)}
              >
                <BanknoteArrowDown className="h-4 w-4" />
                <span>سند صرف لمورد</span>
              </Button>

              <Link to="/store/purchase-invoices/create" className="w-full sm:w-auto">
                <Button type="button" className="flex items-center gap-2 justify-center w-full">
                  <Plus className="h-4 w-4" />
                  <span>إضافة فاتورة شراء</span>
                </Button>
              </Link>
            </div>
          ) : null
        }
      />

      <div className="mb-4 flex w-full sm:w-fit overflow-hidden rounded-lg border border-border bg-white">
        {[
          { key: 'invoices', label: 'فواتير الشراء' },
          { key: 'payments', label: 'سداد' },
          { key: 'returns', label: 'مرتجعات الشراء' },
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

      {activeTab === 'invoices' ? (
        <>
          <div className="mb-4 grid gap-3 rounded-xl border border-border bg-white p-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="بحث برقم الفاتورة..."
                className="pr-9"
              />
            </div>


          </div>

          {purchaseInvoicesQuery.isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Desktop view */}
              <div className="hidden md:block">
                <DataTable columns={columns} data={invoices} loading={purchaseInvoicesQuery.isFetching} emptyMessage="لا توجد فواتير شراء" />
              </div>

              {/* Mobile view */}
              <div className="block md:hidden space-y-3">
                {invoices.length === 0 ? (
                  <div className="rounded-xl border border-border bg-white p-8 text-center text-text-muted">
                    لا توجد فواتير شراء
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
                        <div className="text-text-muted">المورد:</div>
                        <div className="font-medium text-text text-left">
                          {getSupplierName(invoice)}
                        </div>

                        <div className="text-text-muted">التاريخ:</div>
                        <div className="text-text text-left font-mono">
                          {getInvoiceDate(invoice) ? formatDate(getInvoiceDate(invoice)) : '—'}
                        </div>
                      </div>

                      <hr className="border-border" />

                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
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
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <Link
                          to={`/store/purchase-invoices/${invoice.id}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors h-9"
                        >
                          <Eye className="h-4 w-4" />
                          <span>عرض التفاصيل</span>
                        </Link>

                        {invoice?.status !== 'cancelled' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingInvoice(invoice);
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
            isLoading={purchaseInvoicesQuery.isFetching}
          />

          <Dialog
            open={isSupplierPaymentModalOpen}
            onOpenChange={(open) => {
              setIsSupplierPaymentModalOpen(open);

              if (!open) {
                setSupplierSearchTerm('');
                setDebouncedSupplierSearchTerm('');
                resetSupplierPaymentForm({
                  invoice_id: 0,
                  party_id: 0,
                  amount: '',
                  notes: '',
                  date: getTodayDate(),
                });
              }
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BanknoteArrowDown className="h-5 w-5 text-amber-600" />
                  <span>سند صرف — دفع لمورد</span>
                </DialogTitle>
                <DialogDescription>سجّل دفعًا نقديًا للمورد</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSupplierPaymentSubmit(onSubmitSupplierPayment)} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">المورد *</label>

                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <Input
                      value={supplierSearchTerm}
                      onChange={(event) => {
                        setSupplierSearchTerm(event.target.value);
                        setSupplierPaymentValue('party_id', 0);
                      }}
                      placeholder="ابحث عن مورد..."
                      className="pr-9"
                    />
                  </div>

                  {suppliersForPaymentsQuery.isLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <select
                      {...registerSupplierPayment('party_id')}
                      className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text"
                    >
                      <option value={0}>اختر موردًا</option>
                      {suppliersForPayments.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedSupplier ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-text-muted">
                      {selectedSupplier.name} — الرصيد: <BalanceDisplay balance={Number(selectedSupplier.balance) || 0} />
                    </div>
                  ) : null}

                  {supplierPaymentErrors.party_id ? (
                    <p className="text-sm text-danger">{supplierPaymentErrors.party_id.message}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text">المبلغ *</label>
                    <Input type="number" min="0" step="0.01" {...registerSupplierPayment('amount')} />
                    {supplierPaymentErrors.amount ? (
                      <p className="text-sm text-danger">{supplierPaymentErrors.amount.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text">التاريخ</label>
                    <Input type="date" {...registerSupplierPayment('date')} />
                    {supplierPaymentErrors.date ? (
                      <p className="text-sm text-danger">{supplierPaymentErrors.date.message}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">الملاحظات</label>
                  <Input {...registerSupplierPayment('notes')} placeholder="ملاحظات إضافية" />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsSupplierPaymentModalOpen(false)}
                    disabled={supplierPaymentMutation.isPending}
                  >
                    إغلاق
                  </Button>

                  <Button type="submit" disabled={supplierPaymentMutation.isPending}>
                    {supplierPaymentMutation.isPending ? 'جاري الحفظ...' : '💾 حفظ سند الصرف'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(cancellingInvoice)}
            onOpenChange={(open) => {
              if (!open) {
                setCancellingInvoice(null);
                setCancelReason('');
                setCancelReasonError('');
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إلغاء فاتورة الشراء {cancellingInvoice?.invoice_number || `#${cancellingInvoice?.id || ''}`}</DialogTitle>
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
                    setCancellingInvoice(null);
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
      ) : activeTab === 'payments' ? (
        <>
          {paymentsTabLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable columns={supplierPaymentsColumns} data={paymentsTabList} loading={paymentsTabLoading} emptyMessage="لا توجد سندات" />
              </div>

              <div className="block md:hidden space-y-3">
                {paymentsTabList.length === 0 ? (
                  <div className="rounded-xl border border-border bg-white p-8 text-center text-text-muted">لا توجد سندات</div>
                ) : (
                  paymentsTabList.map((p) => (
                    <div key={p.id} className="rounded-xl border border-border bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-text">{p.receipt_number ?? p.payment_number ?? p.id}</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => { setPaymentsModalOpen(true); setEditingPayment(p); }} className="rounded-md p-2 text-primary hover:bg-primary/10"><Edit className="h-4 w-4" /></button>
                          <button type="button" onClick={() => handleDeletePayment(p)} className="rounded-md p-2 text-danger hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="text-sm text-text-muted">{p.payment_date ?? p.date ?? p.transaction_date ?? p.created_at ?? '—'}</div>
                      <div className="text-lg font-semibold">{formatCurrency(p.amount ?? p.debit ?? p.credit ?? 0)}</div>
                      <div className="text-sm text-text-muted">{p.notes ?? p.description ?? '—'}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <PurchaseReturnsTab />
      )}

      {/* Edit Payment Modal */}
      <Dialog
        open={paymentsModalOpen}
        onOpenChange={(open) => {
          setPaymentsModalOpen(open);
          if (!open) {
            setEditingPayment(null);
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>تعديل السند</DialogTitle>
          </DialogHeader>

          {editingPayment ? (
            <div className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">المبلغ</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingPayment.amount ?? editingPayment.debit ?? editingPayment.credit ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">التاريخ</label>
                  <Input
                    type="date"
                    value={editingPayment.transaction_date ?? editingPayment.payment_date ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">رقم السند</label>
                  <Input
                    value={editingPayment.payment_number ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, receipt_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">البيان</label>
                  <Input
                    value={editingPayment.notes ?? editingPayment.description ?? ''}
                    onChange={(e) => setEditingPayment((s) => ({ ...s, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-3">
                <Button
                  type="button"
                  onClick={() => handleSavePayment(editingPayment)}
                  disabled={editingSaving}
                >
                  {editingSaving ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPaymentsModalOpen(false);
                    setEditingPayment(null);
                  }}
                  disabled={editingSaving}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-text-muted">
              لم يتم تحديد سند للتعديل
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
