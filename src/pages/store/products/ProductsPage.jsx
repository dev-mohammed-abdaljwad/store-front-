import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCategories } from '../../../api/categories';
import {
  addVariant,
  createProduct,
  deleteProduct,
  deleteVariant,
  getProducts,
  updateProduct,
  updateVariant,
} from '../../../api/products';
import ConfirmDialog from '../../../components/shared/ConfirmDialog';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import Pagination from '../../../components/shared/Pagination';
import PageHeader from '../../../components/shared/PageHeader';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { useAuthStore } from '../../../store/authStore';
import { normalizePaginatedResponse } from '../../../utils/pagination';

const productSchema = z.object({
  category_id: z.coerce.number().min(1, 'التصنيف مطلوب'),
  name: z.string().min(1, 'اسم المنتج مطلوب'),
  product_type: z.enum(['finished_product', 'raw_material', 'supply']).default('finished_product'),
});

const variantSchema = z.object({
  name: z.string().min(1, 'اسم الحجم مطلوب'),
  purchase_price: z.coerce.number().min(0, 'سعر الشراء غير صحيح'),
  sale_price: z.coerce.number().min(0, 'سعر البيع غير صحيح'),
  units_per_pack: z.coerce.number().min(0.001, 'معامل التحويل يجب أن يكون أكبر من 0').optional().or(z.literal('')),
  low_stock_threshold: z.coerce.number().min(0, 'حد التنبيه غير صحيح').default(0),
  stock_unit: z.string().default('قطعة'),
});

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractCategoryItems = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const getProductCategoryName = (product, categories) => {
  const directName =
    (typeof product?.category === 'string' ? product.category : '') ||
    product?.category?.name ||
    product?.category_name;
  if (directName) return directName;

  const categoryId = toNumber(product?.category_id ?? product?.categoryId);
  if (categoryId <= 0) return '—';

  const matched = categories.find((category) => toNumber(category?.id) === categoryId);
  return matched?.name || '—';
};

const getProductVariants = (product) => {
  if (Array.isArray(product?.variants)) return product.variants;
  return [];
};

const isVariantLowStock = (variant) => {
  if (Boolean(variant?.is_low_stock)) return true;
  const alertLimit = toNumber(variant?.low_stock_threshold);
  if (alertLimit <= 0) return false;
  const stock = toNumber(variant?.current_stock);
  return stock <= alertLimit;
};

const canDeleteProduct = (product) => {
  const variants = getProductVariants(product);
  if (!variants.length) return true;

  return variants.every((variant) => {
    const movementsCount = toNumber(
      variant?.stock_movements_count ?? variant?.movements_count ?? variant?.stock_movements ?? variant?.transactions_count
    );
    const hasMovements = Boolean(variant?.has_stock_movements ?? variant?.has_movements);
    return !hasMovements && movementsCount === 0;
  });
};

function ProductsTableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-center gap-4 p-4">
          <div className="h-4 w-6 animate-pulse rounded bg-slate-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
          <div className="flex gap-1.5">
            <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
            <div className="h-6 w-12 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function ProductTypeBadge({ type }) {
  const types = {
    finished_product: { label: 'منتج نهائي', class: 'bg-blue-50 text-blue-700 border-blue-200' },
    raw_material: { label: 'مادة خام', class: 'bg-orange-50 text-orange-700 border-orange-200' },
    supply: { label: 'مستلزمات', class: 'bg-purple-50 text-purple-700 border-purple-200' },
  };
  const config = types[type] || { label: type, class: 'bg-slate-50 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}

function VariantBadge({ variant, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const stock = toNumber(variant?.current_stock);
  const lowStock = isVariantLowStock(variant);

  const badgeStyle = stock <= 0
    ? 'border-red-200 bg-red-50 text-red-700'
    : lowStock
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  const dotStyle = stock <= 0
    ? 'bg-red-500'
    : lowStock
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const unitsPerPack = toNumber(variant?.units_per_pack);
  const unitsPerPackText = unitsPerPack > 0 ? ` | معامل التحويل: ${unitsPerPack.toLocaleString('ar-EG')}` : '';
  const tooltipText = `سعر الشراء: ${toNumber(variant?.purchase_price).toLocaleString('ar-EG')} | سعر البيع: ${toNumber(variant?.sale_price).toLocaleString('ar-EG')}${unitsPerPackText}`;

  const stockDisplay = unitsPerPack > 0
    ? `×${stock.toLocaleString('ar-EG')} (${(stock * unitsPerPack).toLocaleString('ar-EG')} قطعة)`
    : `×${stock.toLocaleString('ar-EG')}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu((previous) => !previous)}
        title={tooltipText}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:shadow-sm ${badgeStyle}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotStyle}`} />
        <span>{variant?.name || '—'}</span>
        <span className="font-mono opacity-80">{stockDisplay}</span>
      </button>

      {showMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setShowMenu(false)}
            aria-label="إغلاق قائمة الإجراءات"
          />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-28 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                onEdit();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5 text-blue-500" />
              تعديل
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ProductRow({
  product,
  rowNumber,
  categoryName,
  onEdit,
  onDelete,
  onAddVariant,
  onEditVariant,
  onDeleteVariant,
}) {
  const variants = getProductVariants(product);
  const productCanDelete = canDeleteProduct(product);

  return (
    <tr className="group border-b border-border last:border-0 hover:bg-slate-50/50">
      <td className="px-4 py-3 text-xs text-text-muted">{rowNumber.toLocaleString('ar-EG')}</td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-text">{product?.name || '—'}</p>
          <ProductTypeBadge type={product?.product_type} />
        </div>
        {productCanDelete ? null : <p className="mt-0.5 text-xs text-amber-700">لا يمكن حذف المنتج لوجود حركات مخزون.</p>}
      </td>

      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {categoryName}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {variants.map((variant) => (
            <VariantBadge
              key={variant.id}
              variant={variant}
              onEdit={() => onEditVariant(variant)}
              onDelete={() => onDeleteVariant(variant)}
            />
          ))}

          <button
            type="button"
            onClick={onAddVariant}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
          >
            <Plus className="h-3 w-3" />
            حجم
          </button>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
            title="تعديل المنتج"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={!productCanDelete}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            title="حذف المنتج"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const store = useAuthStore((state) => state.store);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [variantTargetProduct, setVariantTargetProduct] = useState(null);
  const [editingVariant, setEditingVariant] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [deletingVariant, setDeletingVariant] = useState(null);
  const currentStoreId = Number(store?.id ?? store?.store_id ?? 0) || undefined;

  const {
    register: registerProduct,
    handleSubmit: handleSubmitProduct,
    reset: resetProduct,
    formState: { errors: productErrors },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      category_id: 0,
      name: '',
      product_type: 'finished_product',
    },
  });

  const {
    register: registerVariant,
    handleSubmit: handleSubmitVariant,
    reset: resetVariant,
    formState: { errors: variantErrors },
  } = useForm({
    resolver: zodResolver(variantSchema),
    defaultValues: {
      name: '',
      purchase_price: 0,
      sale_price: 0,
      units_per_pack: '',
      low_stock_threshold: 0,
      stock_unit: 'قطعة',
    },
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedType]);

  const productsQuery = useQuery({
    queryKey: ['products', currentStoreId, currentPage, searchTerm, selectedCategory, selectedType],
    queryFn: async () =>
      normalizePaginatedResponse(
        await getProducts(currentPage, {
          store_id: currentStoreId,
          search: searchTerm || undefined,
          category_id: selectedCategory || undefined,
          product_type: selectedType !== 'all' ? selectedType : undefined,
        })
      ),
    keepPreviousData: true,
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories-for-products'],
    queryFn: () => getCategories({ page: 1, per_page: 1000 }),
  });

  const createProductMutation = useMutation({
    mutationFn: (payload) => createProduct(payload),
    onSuccess: (response) => {
      toast.success('تم حفظ المنتج بنجاح');
      setIsProductModalOpen(false);
      resetProduct({ category_id: 0, name: '', product_type: 'finished_product' });

      const payload = response?.data?.data ?? response?.data ?? {};
      const createdProduct = payload?.product ?? payload;
      if (createdProduct?.id) {
        setVariantTargetProduct(createdProduct);
        setEditingVariant(null);
        resetVariant({
          name: '',
          purchase_price: 0,
          sale_price: 0,
          units_per_pack: '',
          low_stock_threshold: 0,
          stock_unit: 'قطعة',
        });
        setIsVariantModalOpen(true);
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast.error('تعذر حفظ المنتج'),
  });

  const addVariantMutation = useMutation({
    mutationFn: ({ productId, payload }) => addVariant(productId, payload),
    onSuccess: () => {
      toast.success('تمت إضافة الحجم بنجاح');
      setIsVariantModalOpen(false);
      setEditingVariant(null);
      setVariantTargetProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast.error('تعذر إضافة الحجم'),
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ productId, payload }) => updateProduct(productId, payload),
    onSuccess: () => {
      toast.success('تم تعديل المنتج بنجاح');
      setIsProductModalOpen(false);
      setEditingProduct(null);
      resetProduct({ category_id: 0, name: '' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast.error('تعذر تعديل المنتج'),
  });

  const updateVariantMutation = useMutation({
    mutationFn: ({ productId, variantId, payload }) => updateVariant(productId, variantId, payload),
    onSuccess: () => {
      toast.success('تم تعديل الحجم بنجاح');
      setIsVariantModalOpen(false);
      setEditingVariant(null);
      setVariantTargetProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast.error('تعذر تعديل الحجم'),
  });

  const deleteVariantMutation = useMutation({
    mutationFn: ({ productId, variantId }) => deleteVariant(productId, variantId),
    onSuccess: () => {
      toast.success('تم حذف الحجم بنجاح');
      setDeletingVariant(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast.error('تعذر حذف الحجم'),
  });

  const deleteProductMutation = useMutation({
    mutationFn: (productId) => deleteProduct(productId),
    onSuccess: () => {
      toast.success('تم حذف المنتج بنجاح');
      setDeletingProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => toast.error('تعذر حذف المنتج'),
  });

  const categories = extractCategoryItems(categoriesQuery.data);
  const products = useMemo(() => productsQuery.data?.items || [], [productsQuery.data]);
  const productsMeta = productsQuery.data?.meta || { page: 1, perPage: 10, total: products.length, lastPage: 1 };
  const total = toNumber(productsMeta.total, products.length);
  const lastPage = toNumber(productsMeta.lastPage, 1);
  const perPage = toNumber(productsMeta.perPage, 10);

  const openCreateProductModal = () => {
    setEditingProduct(null);
    resetProduct({ category_id: 0, name: '', product_type: 'finished_product' });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product) => {
    setEditingProduct(product);
    resetProduct({
      category_id: toNumber(product?.category_id ?? product?.categoryId),
      name: product?.name || '',
      product_type: product?.product_type || 'finished_product',
    });
    setIsProductModalOpen(true);
  };

  const openAddVariantModal = (product) => {
    setVariantTargetProduct(product);
    setEditingVariant(null);
    resetVariant({
      name: '',
      purchase_price: 0,
      sale_price: 0,
      units_per_pack: '',
      low_stock_threshold: 0,
      stock_unit: 'قطعة',
    });
    setIsVariantModalOpen(true);
  };

  const openEditVariantModal = (product, variant) => {
    setVariantTargetProduct(product);
    setEditingVariant(variant);
    resetVariant({
      name: variant?.name || '',
      purchase_price: toNumber(variant?.purchase_price),
      sale_price: toNumber(variant?.sale_price),
      units_per_pack: variant?.units_per_pack || '',
      low_stock_threshold: toNumber(variant?.low_stock_threshold),
      stock_unit: variant?.stock_unit || 'قطعة',
    });
    setIsVariantModalOpen(true);
  };

  const onSubmitProduct = (values) => {
    const payload = {
      category_id: Number(values.category_id),
      name: values.name?.trim() || '',
      product_type: values.product_type,
    };

    if (editingProduct?.id) {
      updateProductMutation.mutate({
        productId: editingProduct.id,
        payload,
      });
      return;
    }

    createProductMutation.mutate(payload);
  };

  const onSubmitVariant = (values) => {
    if (!variantTargetProduct?.id) {
      toast.error('لم يتم تحديد المنتج');
      return;
    }

    const payload = {
      name: values.name?.trim() || '',
      purchase_price: Number(values.purchase_price) || 0,
      sale_price: Number(values.sale_price) || 0,
      units_per_pack: values.units_per_pack ? Number(values.units_per_pack) : null,
      low_stock_threshold: Number(values.low_stock_threshold) || 0,
      stock_unit: values.stock_unit || 'قطعة',
    };

    if (editingVariant?.id) {
      updateVariantMutation.mutate({
        productId: variantTargetProduct.id,
        variantId: editingVariant.id,
        payload,
      });
      return;
    }

    addVariantMutation.mutate({
      productId: variantTargetProduct.id,
      payload,
    });
  };

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > lastPage) return;
    setCurrentPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <PageHeader
        title="المنتجات"
        subtitle="إدارة المنتجات والأحجام"
        actions={
          <Button type="button" onClick={openCreateProductModal} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>إضافة منتج</span>
          </Button>
        }
      />

      {/* تبويبات الفلترة حسب نوع المنتج */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'finished_product', label: 'منتجات نهائية 🏭' },
          { id: 'raw_material', label: 'مواد خام 🧪' },
          { id: 'supply', label: 'مستلزمات 📦' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedType(tab.id)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              selectedType === tab.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white text-text hover:bg-slate-50 border border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-border bg-white p-3 md:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="بحث بالمنتج أو الحجم..."
            className="pr-9"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">كل التصنيفات</option>
          {categories.map((category) => (
            <option key={category.id} value={String(category.id)}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {productsQuery.isLoading ? (
          <ProductsTableSkeleton />
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-text-muted">
            <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="font-medium">لا توجد منتجات</p>
            <p className="mt-1 text-xs">ابدأ بإضافة أول منتج</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50">
                  <tr>
                    <th className="w-12 px-4 py-3 text-right text-xs font-medium text-text-muted">#</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">المنتج</th>
                    <th className="w-32 px-4 py-3 text-right text-xs font-medium text-text-muted">التصنيف</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">الأحجام والمخزون</th>
                    <th className="w-32 px-4 py-3 text-right text-xs font-medium text-text-muted">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      rowNumber={(currentPage - 1) * perPage + index + 1}
                      categoryName={getProductCategoryName(product, categories)}
                      onEdit={() => openEditProductModal(product)}
                      onDelete={() => setDeletingProduct(product)}
                      onAddVariant={() => openAddVariantModal(product)}
                      onEditVariant={(variant) => openEditVariantModal(product, variant)}
                      onDeleteVariant={(variant) => setDeletingVariant({ product, variant })}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="block md:hidden divide-y divide-border bg-slate-50/20">
              {products.map((product, index) => {
                const variants = getProductVariants(product);
                const categoryName = getProductCategoryName(product, categories);
                const productCanDelete = canDeleteProduct(product);
                const rowNumber = (currentPage - 1) * perPage + index + 1;

                return (
                  <div key={product.id} className="p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] text-text-muted">#{rowNumber.toLocaleString('ar-EG')}</span>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <h3 className="font-bold text-text text-base">{product?.name || '—'}</h3>
                          <ProductTypeBadge type={product?.product_type} />
                        </div>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 mt-1">
                          {categoryName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditProductModal(product)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          title="تعديل المنتج"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProduct(product)}
                          disabled={!productCanDelete}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          title="حذف المنتج"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {!productCanDelete && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1">
                        لا يمكن حذف المنتج لوجود حركات مخزون.
                      </p>
                    )}

                    <div className="space-y-1.5 pt-1 border-t border-slate-50">
                      <h4 className="text-xs font-medium text-text-muted">الأحجام والمخزون:</h4>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {variants.map((variant) => (
                          <VariantBadge
                            key={variant.id}
                            variant={variant}
                            onEdit={() => openEditVariantModal(product, variant)}
                            onDelete={() => setDeletingVariant({ product, variant })}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => openAddVariantModal(product)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>حجم جديد</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        lastPage={lastPage}
        total={total}
        perPage={10}
        onPageChange={handlePageChange}
        isLoading={productsQuery.isFetching}
      />

      <Dialog
        open={isProductModalOpen}
        onOpenChange={(open) => {
          setIsProductModalOpen(open);
          if (!open) {
            setEditingProduct(null);
            resetProduct({ category_id: 0, name: '', product_type: 'finished_product' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'قم بتعديل بيانات المنتج الأساسية.' : 'أدخل بيانات المنتج الأساسية، ثم أضف الحجم.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitProduct(onSubmitProduct)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">التصنيف *</label>
              <select
                {...registerProduct('category_id')}
                className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value={0}>اختر التصنيف</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {productErrors.category_id ? <p className="text-sm text-danger">{productErrors.category_id.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">نوع المنتج *</label>
              <select
                {...registerProduct('product_type')}
                className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="finished_product">منتج نهائي 🏭</option>
                <option value="raw_material">مادة خام 🧪</option>
                <option value="supply">مستلزمات 📦 (عبوات، كراتين، استيكرات...)</option>
              </select>
              {productErrors.product_type ? <p className="text-sm text-danger">{productErrors.product_type.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">اسم المنتج *</label>
              <Input {...registerProduct('name')} placeholder="اسم المنتج" />
              {productErrors.name ? <p className="text-sm text-danger">{productErrors.name.message}</p> : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsProductModalOpen(false)}
                disabled={createProductMutation.isPending || updateProductMutation.isPending}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={createProductMutation.isPending || updateProductMutation.isPending}>
                {createProductMutation.isPending || updateProductMutation.isPending
                  ? 'جاري الحفظ...'
                  : editingProduct
                    ? 'حفظ التعديلات'
                    : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isVariantModalOpen}
        onOpenChange={(open) => {
          setIsVariantModalOpen(open);
          if (!open) {
            setEditingVariant(null);
            setVariantTargetProduct(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVariant ? 'تعديل الحجم' : 'إضافة حجم'}</DialogTitle>
            <DialogDescription>
              {variantTargetProduct?.name ? `المنتج: ${variantTargetProduct.name}` : 'أدخل بيانات الحجم'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitVariant(onSubmitVariant)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">اسم الحجم *</label>
              <Input {...registerVariant('name')} placeholder="مثال: 1 كيلو أو كرتونة 24 علبة" />
              {variantErrors.name ? <p className="text-sm text-danger">{variantErrors.name.message}</p> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">سعر الشراء *</label>
                <Input type="number" min="0" step="0.01" {...registerVariant('purchase_price')} />
                {variantErrors.purchase_price ? <p className="text-sm text-danger">{variantErrors.purchase_price.message}</p> : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">سعر البيع *</label>
                <Input type="number" min="0" step="0.01" {...registerVariant('sale_price')} />
                {variantErrors.sale_price ? <p className="text-sm text-danger">{variantErrors.sale_price.message}</p> : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">معامل التحويل (اختياري)</label>
              <Input type="number" min="0.001" step="0.001" {...registerVariant('units_per_pack')} placeholder="مثال: 1000 (لبرميل به 1000 سم)" />
              {variantErrors.units_per_pack ? (
                <p className="text-sm text-danger">{variantErrors.units_per_pack.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">وحدة قياس المخزون</label>
              <select
                {...registerVariant('stock_unit')}
                className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="قطعة">قطعة</option>
                <option value="لتر">لتر</option>
                <option value="مل">مل</option>
                <option value="كجم">كجم</option>
                <option value="جرام">جرام</option>
                <option value="عبوة">عبوة</option>
                <option value="متر">متر</option>
                <option value="سم">سم</option>
              </select>
              <p className="text-xs text-text-muted">وحدة القياس اللي بيتتبع بيها المخزون (لتر للخامات السائلة، كجم للوزن...)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">حد التنبيه</label>
              <Input type="number" min="0" step="1" {...registerVariant('low_stock_threshold')} />
              {variantErrors.low_stock_threshold ? (
                <p className="text-sm text-danger">{variantErrors.low_stock_threshold.message}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsVariantModalOpen(false)}
                disabled={addVariantMutation.isPending || updateVariantMutation.isPending}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={addVariantMutation.isPending || updateVariantMutation.isPending}>
                {addVariantMutation.isPending || updateVariantMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingProduct)}
        title="تأكيد الحذف"
        message={`هل أنت متأكد من حذف ${deletingProduct?.name || 'هذا المنتج'}؟`}
        onCancel={() => setDeletingProduct(null)}
        onConfirm={() => deleteProductMutation.mutate(deletingProduct.id)}
        loading={deleteProductMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deletingVariant)}
        title="تأكيد الحذف"
        message={`هل أنت متأكد من حذف الحجم ${deletingVariant?.variant?.name || ''}؟`}
        onCancel={() => setDeletingVariant(null)}
        onConfirm={() =>
          deleteVariantMutation.mutate({
            productId: deletingVariant.product.id,
            variantId: deletingVariant.variant.id,
          })
        }
        loading={deleteVariantMutation.isPending}
      />
    </div>
  );
}
