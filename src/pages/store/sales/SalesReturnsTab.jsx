import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';
import { getSalesReturns } from '../../../api/salesInvoices';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import CreateSalesReturnModal from './CreateSalesReturnModal';
import { Input } from '../../../components/ui/input';

const extractReturns = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.returns)) return payload.returns;
  if (Array.isArray(payload)) return payload;
  return [];
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function SalesReturnsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const returnsQuery = useQuery({
    queryKey: ['sales-returns', searchTerm],
    queryFn: () => getSalesReturns({ search: searchTerm || undefined }),
  });

  const returns = extractReturns(returnsQuery.data);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-text">مرتجعات المبيعات</h2>
          <p className="text-sm text-text-muted">المنتجات المرتجعة من العملاء</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="min-w-0 w-52">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الفاتورة أو المرتجع..."
              className="w-full"
            />
          </div>

          <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 w-full sm:w-auto"
        >
          <Plus size={16} />
          مرتجع جديد
        </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {returnsQuery.isLoading ? (
          <div className="p-8 text-center text-text-muted">جاري التحميل...</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">رقم المرتجع</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">العميل</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">الفاتورة الأصلية</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">عدد الأصناف</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">الإجمالي</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">المبلغ المرتجع</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">المتبقي</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">التاريخ</th>
                  </tr>
                </thead>

                <tbody>
                  {returns.map((ret) => {
                    const returnNumber = ret?.return_number || ret?.number || `SR-${ret?.id || '—'}`;
                    const customerName = ret?.customer_name || ret?.customer?.name || '—';
                    const invoiceNumber = ret?.invoice_number || ret?.sales_invoice_number || '—';
                    const itemsCount = Number(ret?.items_count ?? ret?.items?.length ?? 0) || 0;
                    const totalAmount = toNumber(ret?.total_amount ?? ret?.total ?? ret?.amount);
                    const refundAmount = toNumber(ret?.refund_amount ?? ret?.cash_refund_amount);
                    const remainingAmount = toNumber(ret?.remaining_amount ?? ret?.remaining ?? totalAmount - refundAmount);
                    const dateValue = ret?.date || ret?.return_date || ret?.created_at;

                    return (
                      <tr key={ret?.id || returnNumber} className="border-b border-border last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-primary">{returnNumber}</td>
                        <td className="px-4 py-3 font-medium text-text">{customerName}</td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {invoiceNumber !== '—' ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">{invoiceNumber}</span>
                          ) : (
                            <span className="text-text-muted">مرتجع مستقل</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-muted">{itemsCount} صنف</td>
                        <td className="px-4 py-3 font-mono font-medium text-text">{formatCurrency(totalAmount)}</td>
                        <td className="px-4 py-3 font-mono font-medium text-green-600">
                          {refundAmount > 0 ? formatCurrency(refundAmount) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className={remainingAmount > 0 ? 'font-medium text-danger' : 'text-green-600'}>
                            {remainingAmount > 0 ? formatCurrency(remainingAmount) : 'مكتمل'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">{dateValue ? formatDate(dateValue) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-border">
              {returns.map((ret) => {
                const returnNumber = ret?.return_number || ret?.number || `SR-${ret?.id || '—'}`;
                const customerName = ret?.customer_name || ret?.customer?.name || '—';
                const invoiceNumber = ret?.invoice_number || ret?.sales_invoice_number || '—';
                const itemsCount = Number(ret?.items_count ?? ret?.items?.length ?? 0) || 0;
                const totalAmount = toNumber(ret?.total_amount ?? ret?.total ?? ret?.amount);
                const refundAmount = toNumber(ret?.refund_amount ?? ret?.cash_refund_amount);
                const remainingAmount = toNumber(ret?.remaining_amount ?? ret?.remaining ?? totalAmount - refundAmount);
                const dateValue = ret?.date || ret?.return_date || ret?.created_at;

                return (
                  <div key={ret?.id || returnNumber} className="p-4 space-y-3 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-primary">{returnNumber}</span>
                      <span className="text-xs text-text-muted font-mono">{dateValue ? formatDate(dateValue) : '—'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-sm">
                      <div className="text-text-muted">العميل:</div>
                      <div className="font-medium text-text text-left">{customerName}</div>

                      <div className="text-text-muted">الفاتورة الأصلية:</div>
                      <div className="text-left font-mono text-text">
                        {invoiceNumber !== '—' ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono">{invoiceNumber}</span>
                        ) : (
                          <span className="text-text-muted">مرتجع مستقل</span>
                        )}
                      </div>

                      <div className="text-text-muted">عدد الأصناف:</div>
                      <div className="text-text text-left">{itemsCount} صنف</div>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <div className="text-text-muted mb-1">الإجمالي</div>
                        <div className="font-semibold text-text">{formatCurrency(totalAmount)}</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50/50 p-2 text-emerald-800">
                        <div className="text-emerald-600 mb-1">المرتجع</div>
                        <div className="font-semibold">{refundAmount > 0 ? formatCurrency(refundAmount) : '—'}</div>
                      </div>
                      <div className="rounded-lg bg-red-50/50 p-2 text-red-800">
                        <div className="text-red-600 mb-1">المتبقي</div>
                        <div className="font-semibold">
                          {remainingAmount > 0 ? formatCurrency(remainingAmount) : 'مكتمل'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!returnsQuery.isLoading && returns.length === 0 ? (
          <div className="py-16 text-center text-text-muted">
            <RotateCcw size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">لا توجد مرتجعات بعد</p>
            <p className="mt-1 text-xs">اضغط "مرتجع جديد" لإنشاء أول مرتجع</p>
          </div>
        ) : null}
      </div>

      {showCreate ? (
        <CreateSalesReturnModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
            queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setShowCreate(false);
          }}
        />
      ) : null}
    </div>
  );
}
