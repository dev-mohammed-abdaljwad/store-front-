import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Eye, Printer } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getStatement as getCustomerStatement } from '../../../api/customers';
import { getSalesInvoice } from '../../../api/salesInvoices';
import BalanceDisplay from '../../../components/shared/BalanceDisplay';
import DataTable from '../../../components/shared/DataTable';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PaginationControls from '../../../components/shared/PaginationControls';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency, formatDate, getBalanceColor } from '../../../utils/formatters';
import { normalizePaginatedResponse } from '../../../utils/pagination';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDateRange = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: formatDateInput(firstDay),
    to: formatDateInput(today),
  };
};

const normalizeStatementResponse = (response) => {
  const normalized = normalizePaginatedResponse(response);
  const payload = normalized.payload || {};
  const statementContainer = payload?.statement;
  const statementMeta =
    statementContainer && typeof statementContainer === 'object' && !Array.isArray(statementContainer)
      ? statementContainer
      : null;

  let rows = [];
  if (Array.isArray(payload?.statement)) {
    rows = payload.statement;
  } else if (Array.isArray(statementMeta?.data)) {
    rows = statementMeta.data;
  } else if (Array.isArray(payload?.entries)) {
    rows = payload.entries;
  } else if (Array.isArray(payload?.transactions)) {
    rows = payload.transactions;
  } else {
    rows = normalized.items;
  }

  const pagination = statementMeta
    ? {
        page: toNumber(statementMeta?.current_page ?? statementMeta?.page, 1),
        perPage: toNumber(statementMeta?.per_page ?? statementMeta?.perPage, rows.length || 25),
        total: toNumber(statementMeta?.total, rows.length),
        lastPage: toNumber(statementMeta?.last_page ?? statementMeta?.lastPage, 1),
      }
    : normalized.meta;

  return {
    payload,
    rows,
    pagination,
    party: payload?.customer || payload?.party || null,
    totals: payload?.totals || null,
    balance: toNumber(payload?.balance, 0),
  };
};

const extractInvoicePayload = (response) => {
  const payload = response?.data?.data ?? response?.data ?? {};
  return payload?.invoice ?? payload;
};

export default function CustomerStatement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const store = useAuthStore((state) => state.store);

  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [inputFrom, setInputFrom] = useState(defaultRange.from);
  const [inputTo, setInputTo] = useState(defaultRange.to);
  const [range, setRange] = useState(defaultRange);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const statementQuery = useQuery({
    queryKey: ['customers-statement', id, range.from, range.to, page, perPage],
    queryFn: async () =>
      normalizeStatementResponse(
        await getCustomerStatement(id, {
          from: range.from,
          to: range.to,
          page,
          per_page: perPage,
        })
      ),
    keepPreviousData: true,
  });

  const invoiceDetailsQuery = useQuery({
    queryKey: ['customer-statement-invoice', selectedInvoice?.id],
    queryFn: async () => extractInvoicePayload(await getSalesInvoice(selectedInvoice.id)),
    enabled: Boolean(selectedInvoice?.id),
  });

  const statementRows = useMemo(() => {
    const rows = statementQuery.data?.rows || [];
    let runningBalance = 0;

    return rows.map((item, index) => {
      const amount = toNumber(item?.amount);
      const transactionType = String(item?.type || '').toLowerCase();
      const debit = toNumber(
        item?.debit ?? item?.debit_amount ?? item?.debitAmount,
        transactionType === 'debit' ? amount : 0
      );
      const credit = toNumber(
        item?.credit ?? item?.credit_amount ?? item?.creditAmount,
        transactionType === 'credit' ? amount : 0
      );
      const explicitBalance = item?.balance ?? item?.running_balance ?? item?.runningBalance;

      if (explicitBalance !== undefined && explicitBalance !== null) {
        runningBalance = toNumber(explicitBalance);
      } else {
        runningBalance += debit - credit;
      }

      return {
        id: item?.id ?? `row-${index}`,
        date: item?.date ?? item?.created_at ?? item?.createdAt,
        description: item?.description ?? item?.statement ?? item?.notes ?? '—',
        debit,
        credit,
        balance: runningBalance,
        referenceType: item?.reference_type ?? item?.referenceType ?? null,
        referenceId: toNumber(item?.reference_id ?? item?.referenceId, 0),
      };
    });
  }, [statementQuery.data?.rows]);

  const totals = useMemo(() => {
    const apiTotals = statementQuery.data?.totals;
    if (apiTotals) {
      return {
        debit: toNumber(apiTotals?.debit ?? apiTotals?.total_debit ?? apiTotals?.totalDebit),
        credit: toNumber(apiTotals?.credit ?? apiTotals?.total_credit ?? apiTotals?.totalCredit),
        closing: toNumber(apiTotals?.balance ?? apiTotals?.closing_balance ?? apiTotals?.closingBalance),
      };
    }

    const debit = statementRows.reduce((sum, row) => sum + row.debit, 0);
    const credit = statementRows.reduce((sum, row) => sum + row.credit, 0);
    const closing = statementRows.length ? statementRows[statementRows.length - 1].balance : 0;

    return { debit, credit, closing };
  }, [statementQuery.data?.totals, statementRows]);

  const pagination = statementQuery.data?.pagination || { page: 1, perPage, total: statementRows.length, lastPage: 1 };

  const party = statementQuery.data?.party;
  const customerName = party?.name || location.state?.name || `#${id}`;
  const customerPhone = party?.phone || location.state?.phone || '—';
  const currentBalance = toNumber(
    party?.balance ?? statementQuery.data?.balance ?? location.state?.balance ?? totals.closing
  );

  const columns = [
    {
      key: 'date',
      label: 'التاريخ',
      render: (value) => (value ? formatDate(value) : '—'),
    },
    {
      key: 'description',
      label: 'البيان',
    },
    {
      key: 'debit',
      label: 'مدين',
      render: (value) => formatCurrency(value),
    },
    {
      key: 'credit',
      label: 'دائن',
      render: (value) => formatCurrency(value),
    },
    {
      key: 'balance',
      label: 'الرصيد',
      render: (value) => <span className={`font-semibold ${getBalanceColor(value)}`}>{formatCurrency(value)}</span>,
    },
    {
      key: 'invoice_action',
      label: 'الفاتورة',
      render: (_, row) => {
        const isInvoiceReference =
          row.referenceId > 0 && typeof row.referenceType === 'string' && row.referenceType.includes('sales_invoice');

        if (!isInvoiceReference) return '—';

        return (
          <button
            type="button"
            onClick={() => setSelectedInvoice({ id: row.referenceId })}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            title="عرض الفاتورة"
          >
            <Eye className="h-4 w-4" />
          </button>
        );
      },
    },
  ];

  const invoiceDetails = invoiceDetailsQuery.data || {};
  const invoiceItems = Array.isArray(invoiceDetails?.items) ? invoiceDetails.items : [];

  const invoiceItemsColumns = [
    {
      key: 'product',
      label: 'المنتج',
      render: (_, row) => row?.product?.name || row?.product_name || '—',
    },
    {
      key: 'quantity',
      label: 'الكمية',
      render: (_, row) => Number(row?.quantity ?? row?.qty ?? row?.received_quantity ?? 0).toLocaleString('ar-EG'),
    },
    {
      key: 'unit_price',
      label: 'السعر',
      render: (value, row) => formatCurrency(value ?? row?.price ?? 0),
    },
    {
      key: 'line_total',
      label: 'الإجمالي',
      render: (_, row) => {
        const quantity = Number(row?.quantity ?? row?.qty ?? row?.received_quantity ?? 0) || 0;
        const unitPrice = Number(row?.unit_price ?? row?.price ?? 0) || 0;
        return formatCurrency(quantity * unitPrice);
      },
    },
  ];

  return (
    <div className="space-y-4 print-area">
      <style>
        {`@media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
          body { background: #fff !important; }
        }`}
      </style>

      <div className="print-only mb-8 hidden text-center">
        {store?.logo_url ? (
          <img src={store.logo_url} alt="شعار المتجر" className="mx-auto mb-2 h-16 object-contain" />
        ) : null}
        <h1 className="text-2xl font-bold">{store?.print_header || store?.name || 'المتجر'}</h1>
        {store?.print_phone ? <p>{store.print_phone}</p> : null}
        {store?.print_address ? <p>{store.print_address}</p> : null}
      </div>

      <div className="rounded-xl border border-border bg-white p-4 print-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            <span>رجوع</span>
          </Button>
          <h2 className="text-xl font-bold text-text">كشف حساب: {customerName}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
          <span>الهاتف: {customerPhone}</span>
          <span className="flex items-center gap-1">
            الرصيد الحالي:
            <BalanceDisplay balance={currentBalance} />
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-4 no-print print-card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-text">من</label>
            <Input type="date" value={inputFrom} onChange={(event) => setInputFrom(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text">حتى</label>
            <Input type="date" value={inputTo} onChange={(event) => setInputTo(event.target.value)} />
          </div>

          <Button
            type="button"
            onClick={() => {
              if (!inputFrom || !inputTo) {
                toast.error('يرجى تحديد التاريخ من وإلى');
                return;
              }
              setRange({ from: inputFrom, to: inputTo });
              setPage(1);
            }}
            className="flex items-center gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            <span>بحث</span>
          </Button>

          <Button type="button" variant="outline" onClick={() => window.print()} className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <span>طباعة</span>
          </Button>
        </div>
      </div>

      {statementQuery.isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable columns={columns} data={statementRows} loading={statementQuery.isFetching} emptyMessage="لا توجد حركات" />
      )}

      <PaginationControls
        className="no-print"
        page={pagination.page}
        perPage={pagination.perPage}
        total={pagination.total}
        lastPage={pagination.lastPage}
        onPageChange={(nextPage) => setPage(nextPage)}
        onPerPageChange={(nextPerPage) => {
          setPerPage(nextPerPage);
          setPage(1);
        }}
      />

      <div className="rounded-xl border border-border bg-white p-4 text-sm print-card">
        <div className="flex flex-wrap items-center gap-4">
          <span>الإجمالي مدين: {formatCurrency(totals.debit)}</span>
          <span>الإجمالي دائن: {formatCurrency(totals.credit)}</span>
          <span className={`font-semibold ${getBalanceColor(totals.closing)}`}>
            الرصيد الختامي: {formatCurrency(totals.closing)}
          </span>
        </div>
      </div>

      <Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {invoiceDetails?.invoice_number
                ? `تفاصيل فاتورة ${invoiceDetails.invoice_number}`
                : selectedInvoice?.id
                  ? `تفاصيل فاتورة #${selectedInvoice.id}`
                  : 'تفاصيل الفاتورة'}
            </DialogTitle>
          </DialogHeader>

          {invoiceDetailsQuery.isLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-lg border border-border bg-bg p-3 text-sm text-text-muted md:grid-cols-2">
                <div>العميل: {invoiceDetails?.customer?.name || invoiceDetails?.customer_name || customerName || '—'}</div>
                <div>التاريخ: {invoiceDetails?.invoice_date ? formatDate(invoiceDetails.invoice_date) : '—'}</div>
                <div>الإجمالي: {formatCurrency(invoiceDetails?.total_amount || 0)}</div>
                <div>المدفوع: {formatCurrency(invoiceDetails?.paid_amount || 0)}</div>
              </div>

              <DataTable
                columns={invoiceItemsColumns}
                data={invoiceItems}
                loading={invoiceDetailsQuery.isFetching}
                emptyMessage="لا توجد أصناف"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}