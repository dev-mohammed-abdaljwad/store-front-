import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BanknoteArrowDown, HandCoins, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCustomers } from '../../../api/customers';
import { createCustomerPayment, createSupplierPayment } from '../../../api/payments';
import { getSuppliers } from '../../../api/suppliers';
import BalanceDisplay from '../../../components/shared/BalanceDisplay';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import { getSalesInvoices, getSalesInvoice } from '../../../api/salesInvoices';
import { getPurchaseInvoices, getPurchaseInvoice } from '../../../api/purchaseInvoices';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useNavigate } from 'react-router-dom';
import { deleteSalesInvoice } from '../../../api/salesInvoices';
import { deletePurchaseInvoice } from '../../../api/purchaseInvoices';

const paymentSchema = z.object({
  invoice_id: z.coerce.number().min(1, 'الفاتورة مطلوبة'),
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
  if (Array.isArray(payload)) return payload;
  return [];
};

export default function PaymentsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('customer');
  const [invoiceView, setInvoiceView] = useState('form'); // 'form' or 'list'
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      invoice_id: 0,
      amount: '',
      notes: '',
      date: getTodayDate(),
      receipt_number: '',
    },
  });

  const customersQuery = useQuery({
    queryKey: ['customers-for-payments', debouncedSearchTerm],
    queryFn: () => getCustomers(1, { per_page: 1000, search: debouncedSearchTerm || undefined }),
    enabled: activeTab === 'customer',
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers-for-payments', debouncedSearchTerm],
    queryFn: () => getSuppliers(1, { per_page: 1000, search: debouncedSearchTerm || undefined }),
    enabled: activeTab === 'supplier',
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const submitMutation = useMutation({
    mutationFn: (data) => (activeTab === 'customer' ? createCustomerPayment(data) : createSupplierPayment(data)),
    onSuccess: () => {
      toast.success(activeTab === 'customer' ? 'تم تسجيل التحصيل بنجاح' : 'تم تسجيل الدفع بنجاح');
      reset({
        invoice_id: 0,
        amount: '',
        notes: '',
        date: getTodayDate(),
        receipt_number: '',
      });
      setSearchTerm('');
      setDebouncedSearchTerm('');
    },
    onError: () => toast.error('تعذر حفظ السند'),
  });

  const parties = useMemo(() => {
    const raw = activeTab === 'customer' ? customersQuery.data : suppliersQuery.data;
    return extractItems(raw);
  }, [activeTab, customersQuery.data, suppliersQuery.data]);

  const selectedPartyId = Number(watch('party_id')) || 0;
  const selectedParty = parties.find((party) => Number(party.id) === selectedPartyId);

  const selectedInvoiceId = Number(watch('invoice_id')) || 0;
  const loadingParties = customersQuery.isLoading || suppliersQuery.isLoading;
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceDebouncedSearch, setInvoiceDebouncedSearch] = useState('');
  const [invoiceFrom, setInvoiceFrom] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const deleteMutationSales = useMutation({ mutationFn: (id) => deleteSalesInvoice(id) });
  const deleteMutationPurchase = useMutation({ mutationFn: (id) => deletePurchaseInvoice(id) });

  const loadInvoiceDetails = async (id) => {
    setInvoiceDetails(null);
    try {
      const res = activeTab === 'customer' ? await getSalesInvoice(id) : await getPurchaseInvoice(id);
      setInvoiceDetails(res?.data?.data ?? res?.data ?? null);
    } catch (err) {
      setInvoiceDetails({ error: 'تعذر جلب تفاصيل الفاتورة' });
    }
    setShowInvoiceModal(true);
  };

  const handleDeleteInvoice = async (id) => {
    const ok = window.confirm('هل متأكد من حذف الفاتورة؟ لا يمكن التراجع');
    if (!ok) return;
    try {
      if (activeTab === 'customer') {
        await deleteMutationSales.mutateAsync(id);
      } else {
        await deleteMutationPurchase.mutateAsync(id);
      }
      toast.success('تم الحذف');
      setInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch {
      toast.error('فشل الحذف');
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setInvoiceDebouncedSearch(invoiceSearch.trim());
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [invoiceSearch]);

  useEffect(() => {
    const load = async () => {
      if (!invoiceDebouncedSearch) {
        setInvoices([]);
        return;
      }

      setLoadingInvoices(true);
      try {
        const params = {
          per_page: 50,
          search: invoiceDebouncedSearch,
        };

        if (invoiceFrom) params.date_from = invoiceFrom;
        if (invoiceTo) params.date_to = invoiceTo;
        if (invoiceStatus && invoiceStatus !== 'all') params.status = invoiceStatus;

        const res = activeTab === 'customer'
          ? await getSalesInvoices(1, params)
          : await getPurchaseInvoices(1, params);

        const payload = res?.data?.data ?? res?.data ?? [];
        const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setInvoices(items);
      } catch {
        setInvoices([]);
      } finally {
        setLoadingInvoices(false);
      }
    };

    load();
  }, [activeTab, invoiceDebouncedSearch, invoiceFrom, invoiceTo, invoiceStatus]);

  const onSubmit = (values) => {
    submitMutation.mutate(values);
  };

  return (
    <div>
      <PageHeader title="المدفوعات" subtitle="تسجيل سندات القبض والصرف" />

      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('customer');
            setSearchTerm('');
            setDebouncedSearchTerm('');
            setValue('party_id', 0);
            setValue('invoice_id', 0);
          }}
          className={`rounded-xl border p-3 text-sm font-semibold transition-colors ${
            activeTab === 'customer'
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-white text-text hover:border-primary'
          }`}
        >
          سند قبض — تحصيل من عميل
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('supplier');
            setSearchTerm('');
            setDebouncedSearchTerm('');
            setValue('party_id', 0);
            setValue('invoice_id', 0);
          }}
          className={`rounded-xl border p-3 text-sm font-semibold transition-colors ${
            activeTab === 'supplier'
              ? 'border-primary bg-primary text-white'
              : 'border-border bg-white text-text hover:border-primary'
          }`}
        >
          سند صرف — دفع لمورد
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setInvoiceView('form')}
          className={`rounded-md px-3 py-1 text-sm ${invoiceView === 'form' ? 'bg-primary text-white' : 'border border-border'}`}
        >
          سند
        </button>
        <button
          type="button"
          onClick={() => setInvoiceView('list')}
          className={`rounded-md px-3 py-1 text-sm ${invoiceView === 'list' ? 'bg-primary text-white' : 'border border-border'}`}
        >
          فواتير
        </button>
      </div>

      <div className="rounded-xl border border-border bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-text">
          {activeTab === 'customer' ? (
            <>
              <HandCoins className="h-5 w-5 text-green-600" />
              <span>تحصيل نقدي من عميل</span>
            </>
          ) : (
            <>
              <BanknoteArrowDown className="h-5 w-5 text-amber-600" />
              <span>دفع نقدي لمورد</span>
            </>
          )}
        </div>

        {invoiceView === 'form' ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">ابحث عن الفاتورة برقم الفاتورة أو المرجع *</label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={invoiceSearch}
                  onChange={(event) => {
                    setInvoiceSearch(event.target.value);
                    setValue('invoice_id', 0);
                    setValue('party_id', 0);
                  }}
                  placeholder="أدخل رقم الفاتورة للبحث..."
                  className="pr-9"
                />
              </div>
            </div>

            {loadingInvoices ? (
              <LoadingSpinner size="sm" />
            ) : invoices.length > 0 ? (
              <div className="rounded-lg border border-border p-2 bg-slate-50 space-y-2 max-h-60 overflow-y-auto">
                <div className="text-xs font-semibold text-text-muted px-1">نتائج بحث الفواتير:</div>
                {invoices.map((inv) => {
                  const isSelected = selectedInvoiceId === inv.id;
                  const partyName = inv.customer?.name ?? inv.supplier?.name ?? 'عميل غير معروف';
                  return (
                    <div
                      key={inv.id}
                      onClick={() => {
                        setValue('invoice_id', inv.id);
                        setValue('party_id', inv.customer_id ?? inv.supplier_id ?? 0);
                        if (inv.remaining_amount !== undefined) {
                          setValue('amount', inv.remaining_amount);
                        }
                      }}
                      className={`flex flex-col md:flex-row md:items-center justify-between p-2 rounded-md cursor-pointer border transition-all text-sm ${
                        isSelected
                          ? 'bg-primary/10 border-primary text-primary-dark font-medium'
                          : 'bg-white border-border hover:bg-slate-100 text-text'
                      }`}
                    >
                      <div>
                        <span className="font-semibold">#{inv.invoice_number ?? inv.number ?? inv.id}</span>
                        <span className="mx-2 text-text-muted">|</span>
                        <span>{partyName}</span>
                      </div>
                      <div className="text-xs space-x-2 mt-1 md:mt-0">
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-text-muted">المتبقي: {inv.remaining_amount ?? 0}</span>
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-text-muted">الإجمالي: {inv.total_amount ?? inv.total ?? 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : invoiceDebouncedSearch ? (
              <p className="text-sm text-text-muted">لا توجد فواتير تطابق بحثك</p>
            ) : null}

            {selectedInvoiceId > 0 && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                تم اختيار الفاتورة بنجاح. سيتم ربط التحصيل بالفاتورة المختارة وتلقائياً بالعميل/المورد المرتبط بها.
              </div>
            )}

            {errors.invoice_id ? <p className="text-sm text-danger">{errors.invoice_id.message}</p> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">المبلغ المراد تحصيله/دفعه *</label>
              <Input type="number" min="0" step="0.01" {...register('amount')} />
              {errors.amount ? <p className="text-sm text-danger">{errors.amount.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">التاريخ</label>
              <Input type="date" {...register('date')} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text">الملاحظات</label>
            <Input {...register('notes')} placeholder="ملاحظات إضافية" />
          </div>

          <Button type="submit" disabled={submitMutation.isPending}>
            {submitMutation.isPending
              ? 'جاري الحفظ...'
              : activeTab === 'customer'
                ? '💾 حفظ سند القبض'
                : '💾 حفظ سند الصرف'}
          </Button>
          </form>
        ) : (
          <div>
            <div className="rounded-xl border border-border bg-white p-4">
              <div className="mb-2 text-sm font-semibold">قائمة الفواتير</div>
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="بحث في الفواتير..."
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="w-48"
                  />
                  <Input type="date" value={invoiceFrom} onChange={(e) => setInvoiceFrom(e.target.value)} className="w-36" />
                  <Input type="date" value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} className="w-36" />
                  <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)} className="h-9 rounded border border-border px-2">
                    <option value="all">الكل</option>
                    <option value="open">غير مسدد</option>
                    <option value="paid">مدفوع</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setInvoiceSearch(''); setInvoiceFrom(''); setInvoiceTo(''); setInvoiceStatus('all'); }} className="rounded-md border px-3 py-1 text-sm">مسح</button>
                </div>
              </div>

              {loadingInvoices ? (
                <LoadingSpinner />
              ) : invoices.length === 0 ? (
                <div className="text-sm text-text-muted">لا توجد فواتير لعرضها</div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-sm table-auto">
                    <thead>
                      <tr className="text-left text-text-muted">
                        <th className="py-1 pr-3">#</th>
                        <th className="py-1 pr-3">المرجع</th>
                        <th className="py-1 pr-3">التاريخ</th>
                        <th className="py-1 pr-3">الإجمالي</th>
                        <th className="py-1 pr-3">المتبقي</th>
                        <th className="py-1 pr-3">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-t">
                          <td className="py-2 pr-3">{inv.id}</td>
                          <td className="py-2 pr-3">{inv.number ?? inv.reference ?? '-'}</td>
                          <td className="py-2 pr-3">{inv.invoice_date ?? inv.date ?? inv.created_at ?? '-'}</td>
                          <td className="py-2 pr-3">{inv.total ?? inv.amount ?? '-'}</td>
                          <td className="py-2 pr-3">{inv.remaining_amount ?? inv.remaining ?? inv.remainingAmount ?? 0}</td>
                          <td className="py-2 pr-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="rounded-md border px-2 py-1 text-xs"
                                onClick={() => navigate(activeTab === 'customer' ? `/store/sales-invoices/${inv.id}/edit` : `/store/purchase-invoices/${inv.id}/edit`)}
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                className="rounded-md border px-2 py-1 text-xs text-danger"
                                onClick={() => handleDeleteInvoice(inv.id)}
                              >
                                حذف
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showInvoiceModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowInvoiceModal(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold">تفاصيل الفاتورة</h3>
              <button className="text-sm text-text-muted" onClick={() => setShowInvoiceModal(false)}>إغلاق</button>
            </div>

            <div className="mt-4 text-sm space-y-2">
              {invoiceDetails == null ? (
                <div>جارٍ التحميل...</div>
              ) : invoiceDetails.error ? (
                <div className="text-danger">{invoiceDetails.error}</div>
              ) : (
                <div className="space-y-2">
                  <div><strong>المرجع:</strong> {invoiceDetails.number ?? invoiceDetails.reference ?? '-'}</div>
                  <div><strong>التاريخ:</strong> {invoiceDetails.invoice_date ?? invoiceDetails.date ?? invoiceDetails.created_at ?? '-'}</div>
                  <div><strong>الإجمالي:</strong> {invoiceDetails.total ?? invoiceDetails.amount ?? '-'}</div>
                  <div><strong>المتبقي:</strong> {invoiceDetails.remaining_amount ?? invoiceDetails.remaining ?? invoiceDetails.remainingAmount ?? 0}</div>
                  {Array.isArray(invoiceDetails.items) && (
                    <div className="mt-3">
                      <div className="font-medium">العناصر</div>
                      <ul className="mt-2 list-disc list-inside max-h-40 overflow-auto">
                        {invoiceDetails.items.map((it, idx) => (
                          <li key={idx}>{it.name ?? it.product_name ?? '-'} — {it.quantity ?? it.qty ?? 1} × {it.unit_price ?? it.price ?? it.total ?? '-'}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1 text-sm"
                onClick={() => setShowInvoiceModal(false)}
              >
                إغلاق
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1 text-sm text-white"
                onClick={() => {
                  if (invoiceDetails?.id) setValue('invoice_id', invoiceDetails.id);
                  setShowInvoiceModal(false);
                }}
              >
                اختيار الفاتورة
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

