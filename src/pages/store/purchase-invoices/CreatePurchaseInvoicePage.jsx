import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getCategories } from '../../../api/categories';
import { addVariant, createProduct, searchVariants } from '../../../api/products';
import { createPurchaseInvoice } from '../../../api/purchaseInvoices';
import { getSuppliers } from '../../../api/suppliers';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import SearchableSelect from '../../../components/shared/SearchableSelect';
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
import { formatCurrency } from '../../../utils/formatters';

const getApiErrorMessage = (error, fallback) => {
  const data = error?.response?.data;
  const directMessage = data?.message;
  if (typeof directMessage === 'string' && directMessage.trim()) return directMessage;

  const errors = data?.errors;
  if (errors && typeof errors === 'object') {
    const firstError = Object.values(errors).flat().find((value) => typeof value === 'string' && value.trim());
    if (firstError) return firstError;
  }

  return fallback;
};

const itemSchema = z
  .object({
    variant_id: z.coerce.number().min(1, 'المنتج مطلوب'),
    ordered_quantity: z.coerce.number().int().min(1, 'الكمية المطلوبة يجب أن تكون أكبر من صفر'),
    received_quantity: z.coerce.number().int().min(0, 'الكمية المستلمة غير صحيحة'),
    unit_price: z.coerce.number().min(0, 'سعر الوحدة غير صحيح'),
  })
  .refine((values) => values.received_quantity <= values.ordered_quantity, {
    message: 'الكمية المستلمة لا تتجاوز المطلوبة',
    path: ['received_quantity'],
  });

const purchaseInvoiceSchema = z.object({
  invoice_number: z.string().trim().optional(),
  supplier_id: z.coerce.number().min(1, 'المورد مطلوب'),
  paid_amount: z.coerce.number().min(0, 'المبلغ المدفوع غير صحيح'),
  items: z.array(itemSchema).min(1, 'أضف منتجا واحدا على الأقل'),
});

const createProductWithVariantSchema = z.object({
  category_id: z.coerce.number().min(1, 'التصنيف مطلوب'),
  product_name: z.string().min(1, 'اسم المنتج مطلوب'),
  variant_name: z.string().min(1, 'اسم الحجم مطلوب'),
  purchase_price: z.coerce.number().min(0, 'سعر الشراء غير صحيح'),
  sale_price: z.coerce.number().min(0, 'سعر البيع غير صحيح'),
  low_stock_threshold: z.coerce.number().min(0, 'حد التنبيه غير صحيح').default(0),
});

const defaultItem = {
  variant_id: 0,
  ordered_quantity: 1,
  received_quantity: 1,
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

const extractCategories = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const extractCreatedProduct = (response) => {
  const payload = response?.data?.data ?? response?.data ?? {};
  if (payload?.product?.id) return payload.product;
  return payload;
};

const extractCreatedVariant = (response) => {
  const payload = response?.data?.data ?? response?.data ?? {};
  if (payload?.variant?.id) return payload.variant;
  if (payload?.data?.variant?.id) return payload.data.variant;
  if (payload?.id) return payload;
  return null;
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
    queryKey: ['purchase-quick-add', debouncedSearch],
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
                    المتاح: {Number(variant.current_stock ?? 0).toLocaleString('ar-EG')} قطعة - {formatCurrency(variant.purchase_price ?? variant.sale_price ?? 0)}
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

export default function CreatePurchaseInvoicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedVariants, setSelectedVariants] = useState({});
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [createProductRowIndex, setCreateProductRowIndex] = useState(null);

  const {
    register,
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(purchaseInvoiceSchema),
    defaultValues: {
      invoice_number: '',
      supplier_id: 0,
      paid_amount: 0,
      items: [defaultItem],
    },
  });

  const {
    register: registerCreateProduct,
    handleSubmit: handleSubmitCreateProduct,
    reset: resetCreateProduct,
    formState: { errors: createProductErrors },
  } = useForm({
    resolver: zodResolver(createProductWithVariantSchema),
    defaultValues: {
      category_id: 0,
      product_name: '',
      variant_name: '',
      purchase_price: 0,
      sale_price: 0,
      low_stock_threshold: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers-for-purchase'],
    queryFn: () => getSuppliers(1, { per_page: 1000 }),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories-for-purchase-create'],
    queryFn: () => getCategories({ page: 1, per_page: 1000 }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => createPurchaseInvoice(data),
    onSuccess: () => {
      toast.success('تم إنشاء فاتورة الشراء بنجاح');
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/store/purchase-invoices');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'تعذر إنشاء فاتورة الشراء')),
  });

  const createProductWithVariantMutation = useMutation({
    mutationFn: async (formValues) => {
      const productPayload = {
        category_id: Number(formValues.category_id),
        name: formValues.product_name?.trim() || '',
      };

      const createdProductResponse = await createProduct(productPayload);
      const createdProduct = extractCreatedProduct(createdProductResponse);

      if (!createdProduct?.id) {
        throw new Error('تعذر إنشاء المنتج');
      }

      const variantPayload = {
        name: formValues.variant_name?.trim() || '',
        purchase_price: Number(formValues.purchase_price) || 0,
        sale_price: Number(formValues.sale_price) || 0,
        low_stock_threshold: Number(formValues.low_stock_threshold) || 0,
      };

      const createdVariantResponse = await addVariant(createdProduct.id, variantPayload);
      const createdVariant = extractCreatedVariant(createdVariantResponse);

      if (!createdVariant?.id) {
        throw new Error('تم إنشاء المنتج لكن تعذر إنشاء الحجم');
      }

      return {
        product: createdProduct,
        variant: {
          ...createdVariant,
          name: createdVariant?.name || formValues.variant_name,
          purchase_price: createdVariant?.purchase_price ?? Number(formValues.purchase_price) ?? 0,
          sale_price: createdVariant?.sale_price ?? Number(formValues.sale_price) ?? 0,
          current_stock: createdVariant?.current_stock ?? 0,
        },
      };
    },
    onSuccess: ({ product, variant }) => {
      toast.success('تم إنشاء المنتج والحجم بنجاح');

      if (typeof createProductRowIndex === 'number') {
        const variantLabel = `${product?.name || ''} - ${variant?.name || ''}`.trim();

        setValue(`items.${createProductRowIndex}.variant_id`, Number(variant.id), {
          shouldValidate: true,
          shouldDirty: true,
        });

        setValue(`items.${createProductRowIndex}.unit_price`, Number(variant?.purchase_price ?? variant?.sale_price ?? 0), {
          shouldValidate: true,
          shouldDirty: true,
        });

        setSelectedVariants((previous) => ({
          ...previous,
          [createProductRowIndex]: {
            ...variant,
            id: Number(variant.id),
            name: variantLabel,
            current_stock: Number(variant?.current_stock ?? 0),
          },
        }));
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreateProductModal(false);
      setCreateProductRowIndex(null);
      resetCreateProduct();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, error?.message || 'تعذر إنشاء المنتج والحجم'));
    },
  });

  const suppliers = extractItems(suppliersQuery.data);
  const categories = extractCategories(categoriesQuery.data);
  const itemsValues = watch('items');
  const rows = Array.isArray(itemsValues) ? itemsValues : [];

  const totalAmount = rows.reduce((sum, item) => {
    const received = Number(item?.received_quantity) || 0;
    const unitPrice = Number(item?.unit_price) || 0;
    return sum + received * unitPrice;
  }, 0);

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
      ordered_quantity: 1,
      received_quantity: 1,
      unit_price: Number(variant?.purchase_price ?? variant?.sale_price) || 0,
    });

    setSelectedVariants((previous) => ({
      ...previous,
      [targetIndex]: variant,
    }));
  };

  const openCreateProductForRow = (index) => {
    setCreateProductRowIndex(index);
    setShowCreateProductModal(true);
  };

  const onSubmit = (values) => {
    const payload = {
      invoice_number: values.invoice_number?.trim() || undefined,
      supplier_id: Number(values.supplier_id),
      paid_amount: Number(values.paid_amount) || 0,
      items: values.items.map((item) => {
        const orderedQuantity = Number(item.ordered_quantity) || 0;
        const receivedQuantity = Number(item.received_quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;

        return {
          variant_id: Number(item.variant_id),
          ordered_quantity: orderedQuantity,
          received_quantity: receivedQuantity,
          quantity: receivedQuantity,
          unit_price: unitPrice,
        };
      }),
    };

    createMutation.mutate(payload);
  };

  if (suppliersQuery.isLoading || categoriesQuery.isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        title="إضافة فاتورة شراء"
        subtitle="تسجيل فاتورة شراء جديدة من المورد"
        actions={
          <Link to="/store/purchase-invoices">
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-text">رقم الفاتورة</label>
                <Input dir="ltr" placeholder="مثال: PI-2026-001" {...register('invoice_number')} />
                <p className="text-xs text-text-muted">يمكنك تركه فارغا إذا أردت الترقيم التلقائي من النظام</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">المورد *</label>
                <select
                  {...register('supplier_id')}
                  className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value={0}>اختر المورد</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {errors.supplier_id ? <p className="text-sm text-danger">{errors.supplier_id.message}</p> : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">المدفوع</label>
                <Input type="number" min="0" step="0.01" {...register('paid_amount')} />
                {errors.paid_amount ? <p className="text-sm text-danger">{errors.paid_amount.message}</p> : null}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="border-b border-border p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <QuickAddBar onAdd={handleQuickAdd} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    append(defaultItem);
                    openCreateProductForRow(rows.length);
                  }}
                >
                  منتج جديد
                </Button>
              </div>
            </div>

            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-border">
                    <th className="w-8 px-3 py-2 text-right text-xs font-medium text-text-muted">#</th>
                    <th className="min-w-[220px] px-3 py-2 text-right text-xs font-medium text-text-muted">المنتج / الحجم</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-medium text-text-muted">الكمية المطلوبة</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-medium text-text-muted">الكمية المستلمة</th>
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
                    const ordered = Number(row.ordered_quantity) || 0;
                    const received = Number(row.received_quantity) || 0;
                    const unitPrice = Number(row.unit_price) || 0;
                    const rowTotal = received * unitPrice;
                    const invalidReceived = received > ordered;

                    return (
                      <tr
                        key={field.id}
                        className={`border-b border-border last:border-0 ${
                          invalidReceived ? 'bg-red-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2 text-xs text-text-muted">{index + 1}</td>

                        <td className="px-3 py-2 align-top">
                          <SearchableSelect
                            value={selectedVariantId || null}
                            onChange={(id, selectedVariant) => {
                              setValue(`items.${index}.variant_id`, id ?? 0, { shouldValidate: true, shouldDirty: true });
                              setValue(
                                `items.${index}.unit_price`,
                                selectedVariant?.purchase_price ?? selectedVariant?.sale_price ?? 0,
                                {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                }
                              );
                              setSelectedVariants((previous) => ({ ...previous, [index]: selectedVariant || null }));
                            }}
                            fetchFn={searchVariants}
                            queryKey={`purchase-variants-search-${index}`}
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
                            <p className={`mt-1 text-xs ${invalidReceived ? 'text-danger' : 'text-text-muted'}`}>
                              {invalidReceived
                                ? `المستلم أكبر من المطلوب (${ordered.toLocaleString('ar-EG')})`
                                : `المتاح: ${stock.toLocaleString('ar-EG')} قطعة`}
                            </p>
                          ) : null}

                          <button
                            type="button"
                            className="mt-1 text-xs font-medium text-primary hover:underline"
                            onClick={() => openCreateProductForRow(index)}
                          >
                            + المنتج غير موجود؟
                          </button>
                        </td>

                        <td className="px-3 py-2 align-top">
                          <Input type="number" min="1" step="1" {...register(`items.${index}.ordered_quantity`)} className="h-8 text-sm" />
                          {errors.items?.[index]?.ordered_quantity ? (
                            <p className="mt-1 text-xs text-danger">{errors.items[index].ordered_quantity.message}</p>
                          ) : null}
                        </td>

                        <td className="px-3 py-2 align-top">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            {...register(`items.${index}.received_quantity`)}
                            className={`h-8 text-sm ${invalidReceived ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          />
                          {errors.items?.[index]?.received_quantity ? (
                            <p className="mt-1 text-xs text-danger">{errors.items[index].received_quantity.message}</p>
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
                            title="حذف الصنف"
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
                    <td colSpan={5} className="px-3 py-2 text-left text-sm font-medium text-text-muted">
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

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-xl border border-border bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-text">ملخص الفاتورة</h3>
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-text-muted">الإجمالي الكلي</span>
              <span className="font-bold text-text">{formatCurrency(totalAmount)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={createMutation.isPending} className="flex w-full items-center gap-2">
                <Save className="h-4 w-4" />
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ فاتورة الشراء'}
              </Button>
              <Link to="/store/purchase-invoices" className="w-full">
                <Button type="button" variant="outline" className="w-full">
                  إلغاء
                </Button>
              </Link>
            </div>
          </div>
        </aside>
      </form>

      <Dialog
        open={showCreateProductModal}
        onOpenChange={(open) => {
          setShowCreateProductModal(open);
          if (!open) {
            setCreateProductRowIndex(null);
            resetCreateProduct();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة منتج وحجم جديد</DialogTitle>
            <DialogDescription>أدخل بيانات المنتج ثم الحجم لإضافته مباشرة داخل الفاتورة.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitCreateProduct((values) => createProductWithVariantMutation.mutate(values))} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">التصنيف *</label>
              <select
                {...registerCreateProduct('category_id')}
                className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value={0}>اختر التصنيف</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {createProductErrors.category_id ? <p className="text-sm text-danger">{createProductErrors.category_id.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">اسم المنتج *</label>
              <Input {...registerCreateProduct('product_name')} placeholder="اسم المنتج" />
              {createProductErrors.product_name ? <p className="text-sm text-danger">{createProductErrors.product_name.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">اسم الحجم *</label>
              <Input {...registerCreateProduct('variant_name')} placeholder="مثال: عبوة 1 لتر" />
              {createProductErrors.variant_name ? <p className="text-sm text-danger">{createProductErrors.variant_name.message}</p> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">سعر الشراء *</label>
                <Input type="number" min="0" step="0.01" {...registerCreateProduct('purchase_price')} />
                {createProductErrors.purchase_price ? <p className="text-sm text-danger">{createProductErrors.purchase_price.message}</p> : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">سعر البيع *</label>
                <Input type="number" min="0" step="0.01" {...registerCreateProduct('sale_price')} />
                {createProductErrors.sale_price ? <p className="text-sm text-danger">{createProductErrors.sale_price.message}</p> : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">حد التنبيه</label>
                <Input type="number" min="0" step="1" {...registerCreateProduct('low_stock_threshold')} />
                {createProductErrors.low_stock_threshold ? (
                  <p className="text-sm text-danger">{createProductErrors.low_stock_threshold.message}</p>
                ) : null}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateProductModal(false)}
                disabled={createProductWithVariantMutation.isPending}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={createProductWithVariantMutation.isPending}>
                {createProductWithVariantMutation.isPending ? 'جاري الإضافة...' : 'إضافة المنتج'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
