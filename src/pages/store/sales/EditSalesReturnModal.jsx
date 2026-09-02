import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { searchCustomers } from '../../../api/customers';
import { searchVariants } from '../../../api/products';
import { getSalesReturn, updateSalesReturn, searchSalesInvoices } from '../../../api/salesInvoices';
import SearchableSelect from '../../../components/shared/SearchableSelect';
import { formatCurrency } from '../../../utils/formatters';

const salesReturnSchema = z
  .object({
    customer_id: z.coerce.number().min(1, 'العميل مطلوب'),
    sales_invoice_id: z.coerce.number().optional().nullable(),
    return_number: z.string().trim().min(1, 'رقم المرتجع مطلوب'),
    return_date: z.string().optional(),
    refund_amount: z.coerce.number().min(0, 'المبلغ غير صحيح').default(0),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          variant_id: z.coerce.number().min(1, 'المنتج مطلوب'),
          quantity: z.coerce.number().min(1, 'الكمية يجب أن تكون أكبر من صفر'),
          unit_price: z.coerce.number().min(0, 'السعر غير صحيح'),
          variant: z.any().optional(),
        })
      )
      .min(1, 'أضف بندًا واحدًا على الأقل'),
  })
  .superRefine((values, ctx) => {
    const total = values.items.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    }, 0);

    if ((Number(values.refund_amount) || 0) > total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'المبلغ المرتجع لا يمكن أن يتجاوز إجمالي المرتجع',
        path: ['refund_amount'],
      });
    }
  });

const defaultItem = { variant_id: 0, quantity: 1, unit_price: 0, variant: null };

export default function EditSalesReturnModal({ returnId, onClose, onSuccess }) {
  const [linkInvoice, setLinkInvoice] = useState(false);

  const { data: response, isLoading } = useQuery({
    queryKey: ['sales-return-detail', returnId],
    queryFn: () => getSalesReturn(returnId),
    enabled: !!returnId,
  });

  const returnData = useMemo(() => response?.data?.data ?? response?.data, [response]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(salesReturnSchema),
    defaultValues: {
      customer_id: 0,
      sales_invoice_id: null,
      return_number: '',
      return_date: new Date().toISOString().split('T')[0],
      refund_amount: 0,
      notes: '',
      items: [defaultItem],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const rows = watch('items');
  const refundAmount = Number(watch('refund_amount')) || 0;

  useEffect(() => {
    if (returnData) {
      reset({
        customer_id: returnData.customer_id,
        sales_invoice_id: returnData.sales_invoice_id,
        return_number: returnData.return_number,
        return_date: returnData.return_date || returnData.created_at?.split('T')[0] || '',
        refund_amount: Number(returnData.refund_amount) || 0,
        notes: returnData.notes || '',
        items: (returnData.items || []).map((item) => ({
          variant_id: item.variant_id,
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          variant: item.variant ? { id: item.variant_id, name: `${item.product_name || ''} - ${item.variant_name || ''}`, sale_price: item.unit_price } : null,
        })),
      });
      if (returnData.sales_invoice_id) {
        setLinkInvoice(true);
      }
    }
  }, [returnData, reset]);

  const totals = useMemo(() => {
    const totalAmount = (rows || []).reduce((sum, row) => {
      return sum + (Number(row?.quantity) || 0) * (Number(row?.unit_price) || 0);
    }, 0);

    return {
      totalAmount,
      remainingAmount: Math.max(totalAmount - refundAmount, 0),
    };
  }, [rows, refundAmount]);

  const updateMutation = useMutation({
    mutationFn: (payload) => updateSalesReturn(returnId, payload),
    onSuccess: () => {
      toast.success('تم تعديل مرتجع البيع بنجاح');
      onSuccess?.();
    },
    onError: (error) => {
      const message =
        error?.response?.data?.message ||
        Object.values(error?.response?.data?.errors || {}).flat()?.[0] ||
        'تعذر تعديل مرتجع البيع';
      toast.error(message);
    },
  });

  const onSubmit = (values) => {
    updateMutation.mutate({
      customer_id: Number(values.customer_id),
      sales_invoice_id: linkInvoice ? Number(values.sales_invoice_id) || null : null,
      return_number: values.return_number?.trim(),
      return_date: values.return_date || new Date().toISOString().split('T')[0],
      refund_amount: Number(values.refund_amount) || 0,
      notes: values.notes?.trim() || '',
      items: values.items.map((item) => ({
        variant_id: Number(item.variant_id),
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
      })),
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
          <p className="text-text-muted">جاري تحميل بيانات المرتجع...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4">
      <div className="my-4 w-full max-w-4xl rounded-xl bg-white shadow-xl sm:my-8">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:items-center sm:p-6">
          <div>
            <h2 className="text-lg font-bold text-text">تعديل مرتجع مبيعات</h2>
            <p className="mt-0.5 text-sm text-text-muted">تعديل بيانات البضاعة المرتجعة للعميل</p>
          </div>

          <button type="button" onClick={onClose} className="text-text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4 sm:p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text">العميل *</label>
            <SearchableSelect
              value={Number(watch('customer_id')) || null}
              onChange={(id) => setValue('customer_id', id ?? 0, { shouldValidate: true, shouldDirty: true })}
              fetchFn={searchCustomers}
              queryKey="sales-return-customer"
              placeholder="ابحث عن عميل..."
              renderOption={(customer) => `${customer.name}${customer.phone ? ` - ${customer.phone}` : ''}`}
              renderSelected={(customer) => customer.name}
              initialSelected={returnData?.customer}
              error={errors.customer_id?.message}
            />
            <input type="hidden" {...register('customer_id')} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text">رقم فاتورة المرتجع *</label>
              <input
                type="text"
                placeholder="أدخل رقم المرتجع..."
                {...register('return_number')}
                className="h-10 w-full rounded-lg border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {errors.return_number ? (
                <p className="text-xs text-danger">{errors.return_number.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text">تاريخ فاتورة المرتجع</label>
              <input
                type="date"
                {...register('return_date')}
                className="h-10 w-full rounded-lg border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {errors.return_date ? (
                <p className="text-xs text-danger">{errors.return_date.message}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="linkSalesInvoice"
                checked={linkInvoice}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setLinkInvoice(enabled);
                  if (!enabled) setValue('sales_invoice_id', null, { shouldDirty: true });
                }}
                className="h-4 w-4 rounded accent-primary"
              />
              <label htmlFor="linkSalesInvoice" className="cursor-pointer text-sm font-medium text-text">
                ربط بفاتورة بيع أصلية (اختياري)
              </label>
            </div>

            {linkInvoice ? (
              <div>
                <SearchableSelect
                  value={Number(watch('sales_invoice_id')) || null}
                  onChange={(id) => setValue('sales_invoice_id', id ?? null, { shouldDirty: true })}
                  fetchFn={searchSalesInvoices}
                  queryKey="sales-return-invoice"
                  placeholder="ابحث برقم الفاتورة..."
                  renderOption={(invoice) => `${invoice.invoice_number || `INV-${invoice.id}`} - ${formatCurrency(invoice.total_amount || 0)}`}
                  renderSelected={(invoice) => invoice.invoice_number || `INV-${invoice.id}`}
                  initialSelected={returnData?.invoice}
                />
                <input type="hidden" {...register('sales_invoice_id')} />
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-slate-50 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-text">بنود المرتجع</h3>
            </div>

            <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">المنتج / الحجم</th>
                  <th className="w-24 px-3 py-2 text-right text-xs font-medium text-text-muted">الكمية</th>
                  <th className="w-28 px-3 py-2 text-right text-xs font-medium text-text-muted">السعر</th>
                  <th className="w-24 px-3 py-2 text-right text-xs font-medium text-text-muted">الإجمالي</th>
                  <th className="w-8" />
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {fields.map((field, index) => {
                  const row = rows?.[index] || {};
                  const rowTotal = (Number(row.quantity) || 0) * (Number(row.unit_price) || 0);
                  const rowErrors = errors.items?.[index] || {};

                  return (
                    <tr key={field.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 align-top">
                        <SearchableSelect
                          value={Number(row.variant_id) || null}
                          onChange={(id, variant) => {
                            setValue(`items.${index}.variant_id`, id ?? 0, { shouldValidate: true, shouldDirty: true });
                            setValue(`items.${index}.unit_price`, Number(variant?.sale_price) || 0, {
                              shouldValidate: true,
                              shouldDirty: true,
                            });
                          }}
                          fetchFn={(search) => searchVariants(search, { product_types: 'finished_product' })}
                          queryKey={`sales-return-variant-${index}`}
                          placeholder="ابحث عن منتج..."
                          renderOption={(variant) => `${variant.name} - ${formatCurrency(variant.sale_price || 0)}`}
                          renderSelected={(variant) => variant.name}
                          initialSelected={row.variant}
                          error={rowErrors?.variant_id?.message}
                        />
                        <input type="hidden" {...register(`items.${index}.variant_id`)} />
                      </td>

                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          {...register(`items.${index}.quantity`)}
                          className="h-8 w-full rounded border border-border px-2 text-sm"
                        />
                        {rowErrors?.quantity?.message ? (
                          <p className="mt-1 text-xs text-danger">{rowErrors.quantity.message}</p>
                        ) : null}
                      </td>

                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          {...register(`items.${index}.unit_price`)}
                          className="h-8 w-full rounded border border-border px-2 text-sm"
                        />
                        {rowErrors?.unit_price?.message ? (
                          <p className="mt-1 text-xs text-danger">{rowErrors.unit_price.message}</p>
                        ) : null}
                      </td>

                      <td className="px-3 py-2 font-mono text-sm font-medium">{formatCurrency(rowTotal)}</td>

                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="border-t-2 border-border bg-slate-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs text-text-muted">
                    {fields.length} بند
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-text">{formatCurrency(totals.totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>

            <div className="border-t border-border p-3">
              <button
                type="button"
                onClick={() => append(defaultItem)}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
              >
                <Plus size={15} />
                إضافة بند
              </button>
              {errors.items?.message ? <p className="mt-1 text-xs text-danger">{errors.items.message}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text">المبلغ المرتجع نقدًا</label>
              <input
                type="number"
                min="0"
                step="0.01"
                max={totals.totalAmount}
                placeholder="0"
                {...register('refund_amount')}
                className="h-10 w-full rounded-lg border border-border px-3 text-sm"
              />
              {errors.refund_amount?.message ? (
                <p className="text-xs text-danger">{errors.refund_amount.message}</p>
              ) : (
                <p className="text-xs text-text-muted">سيتم خصمه من الخزنة عند الحفظ</p>
              )}
            </div>

            <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">إجمالي المرتجع</span>
                <span className="font-mono font-bold">{formatCurrency(totals.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-green-700">
                <span>يخصم من رصيد العميل</span>
                <span className="font-mono font-bold">- {formatCurrency(totals.totalAmount)}</span>
              </div>
              {refundAmount > 0 ? (
                <div className="flex justify-between text-danger">
                  <span>يصرف من الخزنة</span>
                  <span className="font-mono font-bold">- {formatCurrency(refundAmount)}</span>
                </div>
              ) : null}
              {totals.remainingAmount > 0 ? (
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-text-muted">رصيد دائن للعميل</span>
                  <span className="font-mono font-bold text-primary">{formatCurrency(totals.remainingAmount)}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text">ملاحظات</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="سبب الإرجاع..."
              className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 rounded-lg bg-primary py-2.5 font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'جاري الحفظ...' : 'تعديل المرتجع'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border py-2.5 font-medium text-text hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
