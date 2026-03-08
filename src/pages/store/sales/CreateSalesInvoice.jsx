import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Save, Trash2 } from 'lucide-react';
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
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
});

const defaultItem = {
  variant_id: 0,
  quantity: 1,
  unit_price: 0,
};

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

  const rows = Array.isArray(itemsValues) ? itemsValues : [];

  const totalAmount = rows.reduce((sum, item) => {
    const quantity = Math.max(Number(item?.quantity) || 1, 1);
    const unitPrice = Number(item?.unit_price) || 0;
    return sum + quantity * unitPrice;
  }, 0);

  const remainingAmount = Math.max(totalAmount - paidAmount, 0);

  const stockViolations = rows.map((item, index) => {
    const variant = selectedVariants[index];
    if (!variant) return false;
    const stock = Number(variant.current_stock ?? 0);
    const qty = Math.max(Number(item.quantity) || 1, 1);
    return qty > stock;
  });

  const hasStockViolation = stockViolations.some(Boolean);
  const isSaveDisabled = fields.length === 0 || selectedCustomerId <= 0;

  const onSubmit = (values) => {
    if (hasStockViolation) {
      toast.error('لا يمكن حفظ الفاتورة: توجد كميات أكبر من المخزون المتاح');
      return;
    }

    if (Number(values.paid_amount) > totalAmount) {
      setError('paid_amount', {
        type: 'manual',
        message: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي',
      });
      return;
    }

    clearErrors('paid_amount');

    createMutation.mutate({
      invoice_number: values.invoice_number?.trim() || undefined,
      customer_id: Number(values.customer_id),
      paid_amount: Number(values.paid_amount) || 0,
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
                  renderOption={(customer) => `${customer.name}${customer.phone ? ` — ${customer.phone}` : ''}`}
                  renderSelected={(customer) => customer.name}
                  error={errors.customer_id?.message}
                />
                <input type="hidden" {...register('customer_id')} />
                {selectedCustomer ? (
                  <p className="text-xs text-text-muted">
                    المختار: {selectedCustomer.name}
                    {selectedCustomer.phone ? ` — ${selectedCustomer.phone}` : ''}
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

          <div className="rounded-xl border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">بنود الفاتورة</h2>
              <Button type="button" variant="outline" className="flex items-center gap-2" onClick={() => append(defaultItem)}>
                <Plus className="h-4 w-4" />
                <span>إضافة بند</span>
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const row = rows[index] || defaultItem;
                const selectedVariantId = Number(row.variant_id) || 0;
                const variant = selectedVariants[index];
                const stock = Number(variant?.current_stock ?? 0);
                const rowQuantity = Math.max(Number(row.quantity) || 1, 1);
                const rowUnitPrice = Number(row.unit_price) || 0;
                const rowTotal = rowQuantity * rowUnitPrice;
                const invalidStock = stockViolations[index];

                return (
                  <div key={field.id} className="rounded-lg border border-border p-3">
                    <div className="grid gap-3 lg:grid-cols-12">
                      <div className="space-y-1 lg:col-span-5">
                        <label className="text-xs font-medium text-text-muted">المنتج / الحجم</label>
                        <SearchableSelect
                          value={selectedVariantId || null}
                          onChange={(id, selectedVariant) => {
                            setValue(`items.${index}.variant_id`, id ?? 0, { shouldValidate: true, shouldDirty: true });
                            setValue(`items.${index}.unit_price`, selectedVariant?.sale_price ?? 0, { shouldValidate: true });
                            setSelectedVariants((previous) => ({ ...previous, [index]: selectedVariant || null }));
                          }}
                          fetchFn={searchVariants}
                          queryKey={`variants-search-${index}`}
                          placeholder="ابحث عن منتج أو حجم..."
                          renderOption={(item) => {
                            const stock = Number(item.current_stock ?? 0);
                            return `${item.name} — المخزون: ${stock.toLocaleString('ar-EG')} قطعة`;
                          }}
                          renderSelected={(item) => item.name}
                          error={errors.items?.[index]?.variant_id?.message}
                        />
                        <input type="hidden" {...register(`items.${index}.variant_id`)} />
                      </div>

                      <div className="space-y-1 lg:col-span-2">
                        <label className="text-xs font-medium text-text-muted">الكمية</label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            {...register(`items.${index}.quantity`)}
                            className={invalidStock ? 'border-red-500 focus-visible:ring-red-500' : ''}
                          />
                        </div>
                        <p className="text-xs text-text-muted">
                          المتاح: {stock.toLocaleString('ar-EG')} قطعة
                        </p>
                        {invalidStock ? (
                          <p className="text-xs font-medium text-danger">
                            ⚠️ المتاح فقط {stock.toLocaleString('ar-EG')} قطعة
                          </p>
                        ) : null}
                        {errors.items?.[index]?.quantity ? (
                          <p className="text-xs text-danger">{errors.items[index].quantity.message}</p>
                        ) : null}
                      </div>

                      <div className="space-y-1 lg:col-span-2">
                        <label className="text-xs font-medium text-text-muted">السعر</label>
                        <Input type="number" min="0" step="0.01" {...register(`items.${index}.unit_price`)} />
                        {errors.items?.[index]?.unit_price ? (
                          <p className="text-xs text-danger">{errors.items[index].unit_price.message}</p>
                        ) : null}
                      </div>

                      <div className="space-y-1 lg:col-span-2">
                        <label className="text-xs font-medium text-text-muted">الإجمالي</label>
                        <div className="flex h-10 items-center rounded-md border border-border bg-slate-50 px-2 text-sm font-semibold text-text">
                          {formatCurrency(rowTotal)}
                        </div>
                      </div>

                      <div className="flex items-end justify-end lg:col-span-1">
                        <button
                          type="button"
                          onClick={() => {
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
                          }}
                          disabled={fields.length === 1}
                          className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="حذف البند"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {errors.items?.message ? <p className="mt-2 text-sm text-danger">{errors.items.message}</p> : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/store/sales-invoices">
              <Button type="button" variant="outline">
                إلغاء
              </Button>
            </Link>

            <Button type="submit" disabled={isSaveDisabled || createMutation.isPending} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              <span>{createMutation.isPending ? 'جاري الحفظ...' : 'حفظ الفاتورة'}</span>
            </Button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-xl border border-border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-text">ملخص الفاتورة</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">الإجمالي</span>
                <span className="font-bold text-text">{formatCurrency(totalAmount)}</span>
              </div>

              <div className="space-y-1">
                <label className="text-text-muted">المدفوع</label>
                <Input type="number" min="0" max={totalAmount} step="0.01" {...register('paid_amount')} />
                {errors.paid_amount ? <p className="text-xs text-danger">{errors.paid_amount.message}</p> : null}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">المتبقي</span>
                <span className={`font-bold ${remainingAmount === 0 ? 'text-green-600' : 'text-danger'}`}>
                  {formatCurrency(remainingAmount)}
                </span>
              </div>

              {remainingAmount === 0 ? (
                <p className="text-sm font-medium text-green-600">مسدد بالكامل ✓</p>
              ) : (
                <p className="text-sm font-medium text-danger">متبقي {formatCurrency(remainingAmount)}</p>
              )}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
