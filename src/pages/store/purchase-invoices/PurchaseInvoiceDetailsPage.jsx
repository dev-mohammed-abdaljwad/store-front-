import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getPurchaseInvoice } from '../../../api/purchaseInvoices';
import DataTable from '../../../components/shared/DataTable';
import InvoiceAttachment from '../../../components/shared/InvoiceAttachment';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import StatusBadge from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/ui/button';
import { formatCurrency, formatDate } from '../../../utils/formatters';

const extractPayload = (response) => response?.data?.data ?? response?.data ?? {};

export default function PurchaseInvoiceDetailsPage() {
  const { id } = useParams();

  const invoiceQuery = useQuery({
    queryKey: ['purchase-invoice-details', id],
    queryFn: async () => extractPayload(await getPurchaseInvoice(id)),
  });

  if (invoiceQuery.isLoading) {
    return <LoadingSpinner />;
  }

  const invoice = invoiceQuery.data || {};
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const existingAttachment =
    invoice?.attachment
      ? {
          name: invoice.attachment?.name || invoice.attachment?.original_name || invoice.attachment_original_name || 'مرفق الفاتورة',
          url: invoice.attachment?.url || invoice.attachment?.path || invoice.attachment_path || null,
        }
      : invoice?.attachment_path || invoice?.attachment_original_name
        ? {
            name: invoice?.attachment_original_name || 'مرفق الفاتورة',
            url: invoice?.attachment_url || invoice?.attachment_path || null,
          }
        : null;

  const columns = [
    {
      key: 'product',
      label: 'المنتج',
      render: (_, row) => row?.product?.name || row?.product_name || '—',
    },
    {
      key: 'ordered_quantity',
      label: 'المطلوب',
    },
    {
      key: 'received_quantity',
      label: 'المستلم',
    },
    {
      key: 'unit_price',
      label: 'سعر الوحدة',
      render: (value) => formatCurrency(value || 0),
    },
    {
      key: 'line_total',
      label: 'الإجمالي',
      render: (_, row) => formatCurrency((Number(row?.received_quantity) || 0) * (Number(row?.unit_price) || 0)),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`تفاصيل فاتورة شراء #${invoice?.invoice_number || id}`}
        subtitle={`التاريخ: ${formatDate(invoice?.invoice_date ?? invoice?.date ?? invoice?.created_at)}`}
        actions={
          <Link to="/store/purchase-invoices" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="flex items-center gap-2 justify-center w-full">
              <ArrowRight className="h-4 w-4" />
              <span>رجوع</span>
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-xl border border-border bg-white p-4 text-sm text-text-muted">
            <div>المورد: <span className="font-semibold text-text">{invoice?.supplier?.name || invoice?.supplier_name || '—'}</span></div>
            <div className="flex items-center gap-1.5">الحالة: <StatusBadge status={invoice?.status || 'confirmed'} /></div>
            <div>التاريخ: <span className="font-semibold text-text">{formatDate(invoice?.invoice_date ?? invoice?.date ?? invoice?.created_at)}</span></div>
          </div>

          {/* Desktop Items Table */}
          <div className="hidden sm:block">
            <DataTable columns={columns} data={items} loading={invoiceQuery.isFetching} emptyMessage="لا توجد أصناف" />
          </div>

          {/* Mobile Items List */}
          <div className="block sm:hidden space-y-2">
            <div className="text-xs font-semibold text-text-muted mb-1">الأصناف:</div>
            {items.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-muted border border-dashed rounded-xl bg-white">
                لا توجد أصناف
              </div>
            ) : (
              items.map((item, index) => (
                <div key={index} className="rounded-xl border border-border bg-white p-3 space-y-1.5 text-xs shadow-sm">
                  <div className="flex justify-between font-semibold">
                    <span>{item?.product?.name || item?.product_name || '—'}</span>
                    <span>{formatCurrency((Number(item?.received_quantity) || 0) * (Number(item?.unit_price) || 0))}</span>
                  </div>
                  <div className="flex justify-between text-text-muted">
                    <span>المطلوب: {item?.ordered_quantity} | المستلم: {item?.received_quantity}</span>
                    <span>سعر الوحدة: {formatCurrency(item?.unit_price ?? 0)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 rounded-xl border border-border bg-white p-4 text-sm text-text-muted">
            <div>الإجمالي: <div className="font-bold text-text text-base mt-0.5">{formatCurrency(invoice?.total_amount || 0)}</div></div>
            <div>المدفوع: <div className="font-bold text-emerald-600 text-base mt-0.5">{formatCurrency(invoice?.paid_amount || 0)}</div></div>
            <div>المتبقي: <div className="font-bold text-danger text-base mt-0.5">{formatCurrency((Number(invoice?.total_amount) || 0) - (Number(invoice?.paid_amount) || 0))}</div></div>
          </div>

          <InvoiceAttachment
            invoiceId={invoice?.id || Number(id)}
            existingAttachment={existingAttachment}
            onUploadSuccess={invoiceQuery.refetch}
            onDeleteSuccess={invoiceQuery.refetch}
          />
        </div>
      </div>
    </div>
  );
}
