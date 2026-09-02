import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRight,
  FlaskConical,
  Lightbulb,
  Trash2,
  Loader2,
} from 'lucide-react';
import { getManufacturingOrder, updateManufacturingOrder, getVariantBom, saveVariantBom } from '../../../api/manufacturing';
import { searchVariants } from '../../../api/products';
import PageHeader from '../../../components/shared/PageHeader';
import SearchableSelect from '../../../components/shared/SearchableSelect';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Card, CardContent } from '../../../components/ui/card';
import { formatCurrency } from '../../../utils/formatters';

export default function EditManufacturingOrderPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  // Loading state
  const [pageLoading, setPageLoading] = useState(true);

  // Produced variant details
  const [producedVariant, setProducedVariant] = useState(null);
  const [producedQty, setProducedQty] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Additional costs
  const [additionalCosts, setAdditionalCosts] = useState('');
  const [additionalCostsNotes, setAdditionalCostsNotes] = useState('');

  // Raw materials
  const [items, setItems] = useState([]);

  // BOM
  const [bomLoading, setBomLoading] = useState(false);
  const [hasBom, setHasBom] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load existing order data
  useEffect(() => {
    (async () => {
      try {
        const res = await getManufacturingOrder(id);
        const order = res.data?.order || res.data;

        setOrderDate(order.order_date ? order.order_date.split('T')[0] : '');
        setOrderNumber(order.order_number || '');
        setNotes(order.notes || '');
        setProducedQty(order.produced_quantity?.toString() || '');
        setSalePrice(order.sale_price ? order.sale_price.toString() : '');
        setAdditionalCosts(order.additional_costs > 0 ? order.additional_costs.toString() : '');
        setAdditionalCostsNotes(order.additional_costs_notes || '');

        setProducedVariant({
          variantId: order.produced_variant_id,
          label: `${order.produced_product_name} — ${order.produced_variant_name}`,
          productName: order.produced_product_name,
          variantName: order.produced_variant_name,
        });

        if (order.items && order.items.length > 0) {
          setItems(order.items.map((item) => ({
            variantId:    item.variant_id,
            label:        `${item.product_name} — ${item.variant_name}`,
            productName:  item.product_name,
            variantName:  item.variant_name,
            quantity:     item.quantity?.toString() || '1',
            unitCost:     item.unit_cost?.toString() || '0',
            currentStock: null, // will show N/A
            unitsPerPack: null,
          })));
        }
      } catch (err) {
        toast.error('فشل تحميل بيانات أمر التصنيع');
        navigate('/store/manufacturing');
      } finally {
        setPageLoading(false);
      }
    })();
  }, [id, navigate]);

  // Get BOM when changing the produced variant
  const handleProducedVariantChange = async (variant) => {
    setProducedVariant(variant);
    setSalePrice('');

    if (!variant?.variantId) {
      setHasBom(false);
      setItems([]);
      return;
    }

    setBomLoading(true);
    try {
      const res = await getVariantBom(variant.variantId);
      const bom = res.data?.bom || [];
      if (bom.length > 0) {
        setHasBom(true);
        setItems(bom.map((b) => ({
          variantId:    b.raw_variant_id,
          label:        `${b.raw_product_name} — ${b.raw_variant_name}`,
          productName:  b.raw_product_name,
          variantName:  b.raw_variant_name,
          quantity:     b.quantity,
          unitCost:     b.unit_cost,
          currentStock: b.current_stock,
          unitsPerPack: b.units_per_pack || null,
          stockUnit:    b.stock_unit || 'قطعة',
        })));
      } else {
        setHasBom(false);
        setItems([]);
      }
    } catch (err) {
      setHasBom(false);
      setItems([]);
    } finally {
      setBomLoading(false);
    }
  };

  // Add raw material item
  const addItem = (variant) => {
    if (items.some((i) => i.variantId === variant.variantId)) {
      toast.error('المادة الخام موجودة بالفعل في القائمة');
      return;
    }
    setItems((prev) => [...prev, {
      variantId:    variant.variantId,
      label:        variant.label,
      productName:  variant.productName,
      variantName:  variant.variantName,
      quantity:     1,
      unitCost:     variant.purchasePrice,
      currentStock: variant.currentStock,
      unitsPerPack: variant.unitsPerPack || null,
      stockUnit:    variant.stockUnit || 'قطعة',
    }]);
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const updateItem = (idx, field, val) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  // Calculations
  const materialsCost = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitCost) || 0), 0);
  const addCosts = parseFloat(additionalCosts) || 0;
  const productionCost = materialsCost + addCosts;
  const qty = parseFloat(producedQty) || 0;
  const unitCost = qty > 0 ? productionCost / qty : 0;
  const profitPerUnit = salePrice ? parseFloat(salePrice) - unitCost : null;

  // Save recipe as BOM
  const handleSaveBom = async () => {
    if (!producedVariant || items.length === 0) return;
    try {
      await saveVariantBom(producedVariant.variantId, items.map((it) => ({
        raw_variant_id: it.variantId,
        quantity: it.quantity,
      })));
      toast.success('تم حفظ وصفة الإنتاج');
      setHasBom(true);
    } catch (err) {
      toast.error('فشل حفظ الوصفة');
    }
  };

  // Form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!producedVariant) { toast.error('يرجى تحديد المنتج النهائي'); return; }
    if (!producedQty || qty <= 0) { toast.error('يرجى إدخال الكمية المُنتجة'); return; }
    if (items.length === 0) { toast.error('يرجى إضافة مواد خام واحدة على الأقل'); return; }

    setSubmitting(true);
    try {
      await updateManufacturingOrder(id, {
        order_number:           orderNumber || null,
        order_date:             orderDate,
        notes:                  notes || null,
        produced_variant_id:    producedVariant.variantId,
        produced_quantity:      qty,
        sale_price:             salePrice ? parseFloat(salePrice) : null,
        additional_costs:       addCosts || null,
        additional_costs_notes: additionalCostsNotes || null,
        items: items.map((it) => ({
          variant_id: it.variantId,
          quantity:   parseFloat(it.quantity),
          unit_cost:  parseFloat(it.unitCost),
        })),
      });
      toast.success('تم تعديل أمر التصنيع بنجاح');
      navigate('/store/manufacturing');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.errors?.items || 'حدث خطأ';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const excludedIds = items.map((i) => i.variantId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12" dir="rtl">
      {/* Page Header */}
      <PageHeader
        title="تعديل أمر التصنيع"
        subtitle="تعديل بيانات أمر التصنيع والمواد الخام والتكاليف"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            <span>رجوع</span>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Right side: Main forms */}
        <div className="space-y-6">
          {/* Card 1: Produced Variant */}
          <Card>
            <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary animate-pulse" />
                <h3 className="text-base font-bold text-text">المنتج النهائي المُنتج</h3>
              </div>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-text">المنتج النهائي *</label>
                  <SearchableSelect
                    value={producedVariant?.variantId || null}
                    onChange={(id, item) => {
                      if (item) {
                        handleProducedVariantChange({
                          variantId: item.id,
                          label: item.name,
                          productName: item.product_name,
                          variantName: item.variant_name,
                          productType: item.product_type,
                          purchasePrice: item.purchase_price,
                          currentStock: item.current_stock,
                          unitsPerPack: item.units_per_pack,
                          stockUnit: item.stock_unit,
                        });
                      } else {
                        handleProducedVariantChange(null);
                      }
                    }}
                    fetchFn={(search) => searchVariants(search, { product_types: 'finished_product' })}
                    queryKey="manufacturing-produced-variant"
                    placeholder="ابحث عن المنتج النهائي..."
                    renderOption={(item) => `${item.name} (المخزون الحالي: ${item.current_stock ?? 0})`}
                    renderSelected={(item) => item.name}
                    defaultLabel={producedVariant?.label || ''}
                  />
                  {bomLoading && <div className="text-xs text-text-muted mt-1 animate-pulse">⏳ جاري جلب وصفة الإنتاج...</div>}
                  {hasBom && !bomLoading && (
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary mt-2">
                      <Lightbulb className="h-3.5 w-3.5" />
                      تم تحميل الوصفة المحفوظة تلقائياً
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">الكمية المُنتجة *</label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={producedQty}
                      onChange={(e) => setProducedQty(e.target.value)}
                      placeholder="مثال: 100"
                      className="pl-10"
                      required
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted select-none">
                      {producedVariant?.stockUnit || 'قطعة'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">تاريخ التصنيع *</label>
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">رقم الأمر (اختياري)</label>
                  <Input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="MFG-001"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text">ملاحظات</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  rows={2}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Raw materials used */}
          <Card>
            <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧪</span>
                <h3 className="text-base font-bold text-text">المواد الخام والمستلزمات المستخدمة</h3>
              </div>
              {producedVariant && items.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleSaveBom} className="text-xs text-primary border-primary hover:bg-primary/5">
                  💾 حفظ كوصفة ثابتة
                </Button>
              )}
            </div>
            <CardContent className="p-6 space-y-4">
              {/* Search to add raw materials */}
              <div>
                <SearchableSelect
                  value={null}
                  onChange={(id, item) => {
                    if (item) {
                      addItem({
                        variantId: item.id,
                        label: item.name,
                        productName: item.product_name,
                        variantName: item.variant_name,
                        purchasePrice: item.purchase_price,
                        currentStock: item.current_stock,
                        unitsPerPack: item.units_per_pack,
                        stockUnit: item.stock_unit,
                      });
                    }
                  }}
                  fetchFn={(search) => searchVariants(search, { product_types: 'raw_material,supply' })}
                  queryKey="manufacturing-raw-materials-search"
                  placeholder="ابحث وأضف مادة خام أو مستلزمات..."
                  renderOption={(item) => `${item.name} (المخزون الحالي: ${item.current_stock ?? 0} ${item.stock_unit || 'قطعة'})`}
                  renderSelected={(item) => ''}
                  disabled={!producedVariant}
                />
                {!producedVariant && (
                  <p className="text-xs text-text-muted mt-1">يجب تحديد المنتج النهائي أولاً لتفعيل إضافة المواد الخام.</p>
                )}
              </div>

              {/* Items Table */}
              {items.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-border py-8 text-center text-sm text-text-muted">
                  ابحث وأضف المواد الخام أو المستلزمات المستخدمة في عملية الإنتاج
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-slate-50/50">
                        <th className="px-4 py-2.5 text-right font-semibold text-text-muted">المادة الخام</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-text-muted w-28">الكمية / العبوات</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-text-muted w-28">إجمالي الوحدات</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-text-muted w-28">السعر (ج)</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-text-muted w-28">الإجمالي</th>
                        <th className="w-10 px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((item, idx) => {
                        const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
                        const isLow = item.currentStock != null && item.currentStock < parseFloat(item.quantity || 0);
                        const hasUnits = item.unitsPerPack > 0;

                        const packQty = item.quantity;
                        const pieceQty = hasUnits ? (parseFloat(packQty || 0) * item.unitsPerPack).toFixed(2) : '—';

                        const handlePackChange = (val) => {
                          updateItem(idx, 'quantity', val);
                        };

                        const handlePieceChange = (val) => {
                          if (!val || parseFloat(val) <= 0) {
                            updateItem(idx, 'quantity', '');
                            return;
                          }
                          const calculatedPacks = parseFloat(val) / item.unitsPerPack;
                          updateItem(idx, 'quantity', Number(calculatedPacks.toFixed(4)).toString());
                        };

                        return (
                          <tr key={idx} className={isLow ? 'bg-red-50/40' : 'hover:bg-slate-50/30'}>
                            <td className="px-4 py-3 align-top">
                              <div className="font-semibold text-text">{item.variantName}</div>
                              <div className="text-xs text-text-muted mt-0.5">{item.productName}</div>
                              {hasUnits && (
                                <div className="text-[10px] text-primary/80 mt-1 font-medium bg-primary/5 inline-block px-1.5 py-0.5 rounded">
                                  العبوة تحتوي {item.unitsPerPack} {item.stockUnit || 'قطعة'}
                                </div>
                              )}
                              {isLow && (
                                <div className="text-[11px] text-danger font-medium flex items-center gap-1 mt-1">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  مخزون منخفض ({item.currentStock} {item.stockUnit})
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top">
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={packQty}
                                  onChange={(e) => handlePackChange(e.target.value)}
                                  className="h-9 text-center font-mono text-sm pl-9"
                                  placeholder={hasUnits ? "العبوات" : "الكمية"}
                                  required
                                />
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted select-none">
                                  {hasUnits ? 'عبوة' : item.stockUnit}
                                </span>
                              </div>
                            </td>

                            <td className="px-3 py-3 align-top text-center">
                              {hasUnits ? (
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={pieceQty}
                                  onChange={(e) => handlePieceChange(e.target.value)}
                                  className="h-9 text-center font-mono text-sm"
                                  placeholder="القطعة"
                                  required
                                />
                              ) : (
                                <span className="text-text-muted block mt-2 text-xs">—</span>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitCost}
                                onChange={(e) => updateItem(idx, 'unitCost', e.target.value)}
                                className="h-9 text-center font-mono text-sm"
                                required
                              />
                            </td>

                            <td className="px-3 py-3 align-top text-center font-mono font-semibold text-text pt-4">
                              {formatCurrency(total)}
                            </td>

                            <td className="px-3 py-3 align-top pt-3">
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="rounded p-1.5 text-danger hover:bg-red-50"
                                title="حذف البند"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Additional Costs */}
          <Card>
            <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="text-lg">💰</span>
                <h3 className="text-base font-bold text-text">مصاريف تشغيل إضافية (اختياري)</h3>
              </div>
            </div>
            <CardContent className="p-6 space-y-4">
              <p className="text-xs text-text-muted">
                مصاريف إضافية (كالعمالة أو الكهرباء) سيتم خصمها من الخزينة وتضمينها في تكلفة المنتج النهائي الإجمالية لتحديث سعر الشراء بدقة.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">مبلغ المصاريف (ج)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={additionalCosts}
                    onChange={(e) => setAdditionalCosts(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text">الوصف والبيان</label>
                  <Input
                    value={additionalCostsNotes}
                    onChange={(e) => setAdditionalCostsNotes(e.target.value)}
                    placeholder="مثال: أجرة عمال التعبئة أو استهلاك وقود"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Left side: Costs Summary & Submission */}
        <div className="space-y-6 lg:sticky lg:top-20">
          {/* Card: Costs Summary */}
          <Card>
            <div className="border-b border-border px-6 py-4 bg-slate-50/50 rounded-t-2xl">
              <h3 className="text-sm font-bold text-text">ملخص التكاليف</h3>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">تكلفة المواد الخام</span>
                  <span className="font-mono font-semibold text-text">{formatCurrency(materialsCost)}</span>
                </div>
                {addCosts > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted">مصاريف إضافية</span>
                    <span className="font-mono font-semibold text-text">{formatCurrency(addCosts)}</span>
                  </div>
                )}
                <div className="border-t border-border my-2" />
                <div className="flex justify-between items-center text-base font-bold">
                  <span className="text-text">إجمالي التكلفة</span>
                  <span className="font-mono text-primary">{formatCurrency(productionCost)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-text-muted">
                  <span>عدد الوحدات المنتجة</span>
                  <span className="font-mono font-medium">{qty > 0 ? `${qty} وحدة` : '—'}</span>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center">
                  <p className="text-xs text-text-muted mb-1">تكلفة الوحدة الواحدة</p>
                  <p className="text-2xl font-bold text-primary font-mono">
                    {qty > 0 ? unitCost.toFixed(2) : '—'} <span className="text-xs font-normal">ج</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Sale Price & Profit Margin */}
          <Card>
            <div className="border-b border-border px-6 py-4 bg-slate-50/50 rounded-t-2xl">
              <h3 className="text-sm font-bold text-text">سعر البيع وهامش الربح</h3>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-muted">سعر بيع الوحدة (ج)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder={qty > 0 ? `التكلفة: ${unitCost.toFixed(2)} ج` : 'أدخل سعر البيع...'}
                />
              </div>

              {salePrice && qty > 0 && (
                <div className={`rounded-xl p-3 border text-sm space-y-1 ${
                  profitPerUnit >= 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex justify-between items-center">
                    <span>ربح الوحدة الواحدة:</span>
                    <span className="font-mono font-bold">{profitPerUnit >= 0 ? '+' : ''}{profitPerUnit?.toFixed(2)} ج</span>
                  </div>
                  <div className="flex justify-between items-center text-xs opacity-80 pt-1 border-t border-current/10">
                    <span>إجمالي الهامش المتوقع:</span>
                    <span className="font-mono font-semibold">{(profitPerUnit * qty).toFixed(2)} ج</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="space-y-3">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark h-12 rounded-xl text-base"
            >
              <FlaskConical className="h-5 w-5" />
              <span>{submitting ? 'جاري حفظ التعديلات...' : 'حفظ التعديلات'}</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="w-full h-11 rounded-lg text-text-muted hover:text-text"
            >
              إلغاء
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
