import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { searchCustomers } from '../../../api/customers';
import { searchVariants } from '../../../api/products';
import { createSalesInvoice } from '../../../api/salesInvoices';
import PageHeader from '../../../components/shared/PageHeader';
import SearchableSelect from '../../../components/shared/SearchableSelect';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatCurrency } from '../../../utils/formatters';

const itemSchema = z.object({
  variant_id: z.coerce.number().min(1, 'المنتج مطلوب'),
  quantity: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return 1;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    },
    z.number().min(1, 'الكمية يجب أن تكون على الأقل 1')
  ),
  unit_price: z.coerce.number().min(0, 'السعر غير صحيح'),
});

const salesInvoiceSchema = z.object({
  invoice_number: z.string().trim().optional(),
  customer_id: z.coerce.number().min(1, 'العميل مطلوب'),
  paid_amount: z.coerce.number().min(0, 'المبلغ المدفوع غير صحيح'),
  discount_amount: z.coerce.number().min(0, 'الخصم غير صحيح').default(0),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
});

const defaultItem = {
  variant_id: 0,
  quantity: 1,
  unit_price: 0,
};

const extractItems = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
};

function QuickAddBar({ onAdd }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const onMouseDown = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const variantsQuery = useQuery({
    queryKey: ['sales-quick-add', debouncedSearch],
    queryFn: () => searchVariants(debouncedSearch),
    enabled: debouncedSearch.trim().length > 0,
    keepPreviousData: true,
  });

  const results = useMemo(() => extractItems(variantsQuery.data).slice(0, 8), [variantsQuery.data]);

  useEffect(() => {
    if (debouncedSearch.trim() && results.length > 0) {
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [debouncedSearch, results.length]);

  const handleSelect = (variant) => {
    onAdd(variant);
    setSearch('');
    setDebouncedSearch('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3">
        <Search className="h-4 w-4 shrink-0 text-text-muted" />
        <input
          type="text"
          value={search}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث عن منتج وأضفه مباشرة..."
          className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
        />
        {search ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setDebouncedSearch('');
              setOpen(false);
            }}
            className="text-text-muted hover:text-danger"
            aria-label="مسح البحث"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
          {variantsQuery.isLoading ? (
            <p className="px-3 py-3 text-sm text-text-muted">جاري البحث...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-muted">لا توجد نتائج</p>
          ) : (
            results.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onMouseDown={() => handleSelect(variant)}
                className="flex w-full items-center justify-between px-3 py-2 text-right hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-text">{variant.name}</p>
                  <p className="text-xs text-text-muted">
                    المتاح: {Number(variant.current_stock ?? 0).toLocaleString('ar-EG')} قطعة - {formatCurrency(variant.sale_price ?? 0)}
                  </p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function CreateSalesInvoice() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});

  const {
    register,
    control,
    watch,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(salesInvoiceSchema),
    defaultValues: {
      invoice_number: '',
      customer_id: 0,
      paid_amount: 0,
      discount_amount: 0,
      notes: '',
      items: [defaultItem],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const createMutation = useMutation({
    mutationFn: (payload) => createSalesInvoice(payload),
    onSuccess: (response) => {
      const payload = response?.data?.data ?? response?.data ?? {};
      const invoice = payload?.invoice ?? payload;
      const invoiceNumber = invoice?.invoice_number || `INV-${invoice?.id || 'XXXX'}`;
      toast.success(`تم إنشاء الفاتورة رقم ${invoiceNumber} بنجاح`);
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/store/sales-invoices');
    },
    onError: () => toast.error('تعذر إنشاء فاتورة البيع'),
  });

  const selectedCustomerId = Number(watch('customer_id')) || 0;
  const itemsValues = watch('items');
  const paidAmount = Number(watch('paid_amount')) || 0;
  const discountAmount = Number(watch('discount_amount')) || 0;

  const rows = Array.isArray(itemsValues) ? itemsValues : [];

  const totalAmount = rows.reduce((sum, item) => {
    const quantity = Math.max(Number(item?.quantity) || 1, 1);
    const unitPrice = Number(item?.unit_price) || 0;
    return sum + quantity * unitPrice;
  }, 0);

  const netAmount = Math.max(totalAmount - discountAmount, 0);
  const remainingAmount = Math.max(netAmount - paidAmount, 0);

  const stockViolations = rows.map((item, index) => {
    const variant = selectedVariants[index];
    if (!variant) return false;
    const stock = Number(variant.current_stock ?? 0);
    const qty = Math.max(Number(item.quantity) || 1, 1);
    return qty > stock;
  });

  const hasStockViolation = stockViolations.some(Boolean);
  const isSaveDisabled = fields.length === 0 || selectedCustomerId <= 0;

  const itemsByCategory = useMemo(() => {
    const groups = {};

    rows.forEach((item, index) => {
      const variant = selectedVariants[index];
      if (!variant) return;

      const categoryName =
        variant?.category ?? variant?.category_name ?? variant?.product?.category?.name ?? 'غير مصنف';
      const categoryId = Number(variant?.category_id ?? variant?.product?.category_id ?? 0) || 0;
      const lineTotal = (Number(item?.quantity) || 0) * (Number(item?.unit_price) || 0);

      if (!groups[categoryId]) {
        groups[categoryId] = { name: categoryName, items: [], total: 0 };
      }

      groups[categoryId].items.push({
        name: variant?.name || '—',
        quantity: Number(item?.quantity) || 0,
        price: Number(item?.unit_price) || 0,
        total: lineTotal,
      });
      groups[categoryId].total += lineTotal;
    });

    return Object.values(groups);
  }, [rows, selectedVariants]);

  const removeRow = (index) => {
    setSelectedVariants((previous) => {
      const updated = { ...previous };
      delete updated[index];

      const shifted = {};
      Object.keys(updated).forEach((key) => {
        const numericKey = Number(key);
        const targetKey = numericKey > index ? numericKey - 1 : numericKey;
        shifted[targetKey] = updated[key];
      });

      return shifted;
    });
    remove(index);
  };

  const handleQuickAdd = (variant) => {
    const targetIndex = rows.length;
    append({
      variant_id: Number(variant?.id) || 0,
      quantity: 1,
      unit_price: Number(variant?.sale_price) || 0,
    });

    setSelectedVariants((previous) => ({
      ...previous,
      [targetIndex]: variant,
    }));
  };

  const onSubmit = (values) => {
    if (hasStockViolation) {
      toast.error('لا يمكن حفظ الفاتورة: توجد كميات أكبر من المخزون المتاح');
      return;
    }

    if (Number(values.paid_amount) > netAmount) {
      setError('paid_amount', {
        type: 'manual',
        message: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي بعد الخصم',
      });
      return;
    }

    clearErrors('paid_amount');

    createMutation.mutate({
      invoice_number: values.invoice_number?.trim() || undefined,
      customer_id: Number(values.customer_id),
      paid_amount: Number(values.paid_amount) || 0,
      discount_amount: Number(values.discount_amount) || 0,
      notes: values.notes?.trim() || '',
      items: values.items.map((item) => ({
        variant_id: Number(item.variant_id),
        quantity: Math.max(Number(item.quantity) || 1, 1),
        unit_price: Number(item.unit_price),
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="إنشاء فاتورة بيع جديدة"
        subtitle="إضافة فاتورة بيع مع البنود والكميات والأسعار"
        actions={
          <Link to="/store/sales-invoices">
            <Button type="button" variant="outline" className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              <span>رجوع</span>
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-text">بيانات الفاتورة</h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">رقم الفاتورة</label>
                <Input dir="ltr" placeholder="مثال: SI-2026-001" {...register('invoice_number')} />
                <p className="text-xs text-text-muted">يمكنك تركه فارغًا إذا أردت الترقيم التلقائي من النظام</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">العميل *</label>
                <SearchableSelect
                  value={selectedCustomerId || null}
                  onChange={(id, customer) => {
                    setValue('customer_id', id ?? 0, { shouldValidate: true, shouldDirty: true });
                    setSelectedCustomer(customer);
                  }}
                  fetchFn={searchCustomers}
                  queryKey="customers-search"
                  placeholder="ابحث عن عميل بالاسم أو الهاتف..."
                  renderOption={(customer) => `${customer.name}${customer.phone ? ` - ${customer.phone}` : ''}`}
                  renderSelected={(customer) => customer.name}
                  error={errors.customer_id?.message}
                />
                <input type="hidden" {...register('customer_id')} />
                {selectedCustomer ? (
                  <p className="text-xs text-text-muted">
                    المختار: {selectedCustomer.name}
                    {selectedCustomer.phone ? ` - ${selectedCustomer.phone}` : ''}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">ملاحظات</label>
                <textarea
                  {...register('notes')}
                  rows={3}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="ملاحظات إضافية..."
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="border-b border-border p-3">
              <QuickAddBar onAdd={handleQuickAdd} />
            </div>

            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-border">
                    <th className="w-8 px-3 py-2 text-right text-xs font-medium text-text-muted">#</th>
                    <th className="min-w-[240px] px-3 py-2 text-right text-xs font-medium text-text-muted">المنتج / الحجم</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-medium text-text-muted">الكمية</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-medium text-text-muted">السعر</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-medium text-text-muted">الإجمالي</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>

                <tbody>
                  {fields.map((field, index) => {
                    const row = rows[index] || defaultItem;
                    const selectedVariantId = Number(row.variant_id) || 0;
                    const variant = selectedVariants[index];
                    const stock = Number(variant?.current_stock ?? 0);
                    const quantity = Math.max(Number(row.quantity) || 1, 1);
                    const rowUnitPrice = Number(row.unit_price) || 0;
                    const rowTotal = quantity * rowUnitPrice;
                    const invalidStock = stockViolations[index];

                    return (
                      <tr
                        key={field.id}
                        className={`border-b border-border last:border-0 ${
                          invalidStock ? 'bg-red-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2 text-xs text-text-muted">{index + 1}</td>

                        <td className="px-3 py-2 align-top">
                          <SearchableSelect
                            value={selectedVariantId || null}
                            onChange={(id, selectedVariant) => {
                              setValue(`items.${index}.variant_id`, id ?? 0, { shouldValidate: true, shouldDirty: true });
                              setValue(`items.${index}.unit_price`, selectedVariant?.sale_price ?? 0, {
                                shouldValidate: true,
                                shouldDirty: true,
                              });
                              setSelectedVariants((previous) => ({ ...previous, [index]: selectedVariant || null }));
                            }}
                            fetchFn={searchVariants}
                            queryKey={`variants-search-${index}`}
                            placeholder="ابحث..."
                            renderOption={(item) => {
                              const currentStock = Number(item.current_stock ?? 0);
                              return `${item.name} - ${currentStock.toLocaleString('ar-EG')} قطعة`;
                            }}
                            renderSelected={(item) => item.name}
                            error={errors.items?.[index]?.variant_id?.message}
                          />
                          <input type="hidden" {...register(`items.${index}.variant_id`)} />

                          {variant ? (
                            <p className={`mt-1 text-xs ${invalidStock ? 'text-danger' : 'text-text-muted'}`}>
                              {invalidStock
                                ? `المتاح فقط ${stock.toLocaleString('ar-EG')} قطعة`
                                : `المتاح: ${stock.toLocaleString('ar-EG')} قطعة`}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-3 py-2 align-top">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            {...register(`items.${index}.quantity`)}
                            className={`h-8 text-sm ${invalidStock ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          />
                          {errors.items?.[index]?.quantity ? (
                            <p className="mt-1 text-xs text-danger">{errors.items[index].quantity.message}</p>
                          ) : null}
                        </td>

                        <td className="px-3 py-2 align-top">
                          <Input type="number" min="0" step="0.01" {...register(`items.${index}.unit_price`)} className="h-8 text-sm" />
                          {errors.items?.[index]?.unit_price ? (
                            <p className="mt-1 text-xs text-danger">{errors.items[index].unit_price.message}</p>
                          ) : null}
                        </td>

                        <td className="px-3 py-2 align-top font-mono text-sm font-semibold text-text">{formatCurrency(rowTotal)}</td>

                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            disabled={fields.length === 1}
                            className="rounded p-1 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                            title="حذف البند"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="bg-slate-50">
                  <tr className="border-t-2 border-border">
                    <td colSpan={4} className="px-3 py-2 text-left text-sm font-medium text-text-muted">
                      {fields.length} بند
                    </td>
                    <td className="px-3 py-2 font-mono text-sm font-bold text-text">{formatCurrency(totalAmount)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={() => append(defaultItem)}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
              >
                <Plus className="h-4 w-4" />
                إضافة بند يدويا
              </button>
            </div>

            {errors.items?.message ? <p className="px-3 pb-3 text-sm text-danger">{errors.items.message}</p> : null}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          {itemsByCategory.length > 0 ? (
            <div className="rounded-xl border border-border bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-text">ملخص بالتصنيف</h2>

              <div className="space-y-3">
                {itemsByCategory.map((category, categoryIndex) => (
                  <div key={`${category.name}-${categoryIndex}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-text">{category.name}</span>
                      <span className="font-mono text-sm font-bold text-primary">{formatCurrency(category.total)}</span>
                    </div>

                    <div className="space-y-0.5 border-r-2 border-slate-200 pr-3">
                      {category.items.map((item, itemIndex) => (
                        <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between text-xs text-text-muted">
                          <span>
                            {item.name} × {item.quantity}
                          </span>
                          <span className="font-mono">{formatCurrency(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">إجمالي ({rows.length} صنف)</span>
                  <span className="font-mono font-bold text-text">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-text">ملخص الفاتورة</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">الإجمالي</span>
                <span className="font-mono font-bold text-text">{formatCurrency(totalAmount)}</span>
              </div>

              <div className="space-y-1">
                <label className="text-text-muted">الخصم (جنيه)</label>
                <Input type="number" min="0" max={totalAmount} step="0.01" placeholder="0" {...register('discount_amount')} />
                {errors.discount_amount ? <p className="text-xs text-danger">{errors.discount_amount.message}</p> : null}
              </div>

              {discountAmount > 0 ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                  <span className="font-medium text-green-700">بعد الخصم</span>
                  <span className="font-mono font-bold text-green-700">{formatCurrency(netAmount)}</span>
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-text-muted">المدفوع</label>
                <Input type="number" min="0" max={netAmount} step="0.01" {...register('paid_amount')} />
                {errors.paid_amount ? <p className="text-xs text-danger">{errors.paid_amount.message}</p> : null}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">المتبقي</span>
                <span className={`font-mono font-bold ${remainingAmount === 0 ? 'text-green-600' : 'text-danger'}`}>
                  {formatCurrency(remainingAmount)}
                </span>
              </div>

              {remainingAmount === 0 ? (
                <p className="text-sm font-medium text-green-600">مسدد بالكامل ✓</p>
              ) : (
                <p className="text-sm font-medium text-danger">متبقي {formatCurrency(remainingAmount)}</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaveDisabled || createMutation.isPending} className="flex w-full items-center gap-2">
                <Save className="h-4 w-4" />
                <span>{createMutation.isPending ? 'جاري الحفظ...' : 'حفظ الفاتورة'}</span>
              </Button>

              <Link to="/store/sales-invoices" className="w-full">
                <Button type="button" variant="outline" className="w-full">
                  إلغاء
                </Button>
              </Link>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
