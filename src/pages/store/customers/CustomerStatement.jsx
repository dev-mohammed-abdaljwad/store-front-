import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Eye, Printer, Edit, XCircle, Trash2 } from 'lucide-react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getStatement as getCustomerStatement } from '../../../api/customers';
import { getSalesInvoice, cancelSalesInvoice } from '../../../api/salesInvoices';
import { updatePayment, deletePayment } from '../../../api/payments';
import BalanceDisplay from '../../../components/shared/BalanceDisplay';
import DataTable from '../../../components/shared/DataTable';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PaginationControls from '../../../components/shared/PaginationControls';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency, formatDate, getBalanceColor } from '../../../utils/formatters';
import { normalizePaginatedResponse } from '../../../utils/pagination';

const getTypeLabel = (referenceType) => {
  const type = String(referenceType || '').toLowerCase();
  if (type.includes('sales') && type.includes('invoice')) return 'فاتورة بيع';
  if (type.includes('invoice')) return 'فاتورة';
  if (type.includes('payment') || type.includes('receipt') || type.includes('customer_payment')) return 'سداد';
  if (type.includes('credit') && type.includes('note')) return 'إشعار دائن';
  if (type.includes('debit') && type.includes('note')) return 'إشعار مدين';
  if (type.includes('journal')) return 'قيد يومية';
  if (type.includes('opening') || type.includes('initial')) return 'رصيد افتتاحي';
  return referenceType || '—';
};

const formatNumber = (num) => {
  if (!num || num === 0) return '';
  return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(num));
};

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
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [cancelInvoice, setCancelInvoice] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');
  const [invoiceDateMap, setInvoiceDateMap] = useState({});

  const isSalesInvoiceType = (type) => {
    const lower = String(type || '').toLowerCase();
    return (lower.includes('sales') && lower.includes('invoice')) || lower.includes('sales_invoice') || lower.includes('salesinvoice');
  };



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

  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => cancelSalesInvoice(id, { reason }),
    onSuccess: () => {
      toast.success('تم إلغاء الفاتورة بنجاح');
      setCancelInvoice(null);
      setCancelReason('');
      setCancelReasonError('');
      queryClient.invalidateQueries({ queryKey: ['customers-statement', id] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
    },
    onError: (error) => {
      const apiMessage =
        error?.response?.data?.errors?.reason?.[0] ||
        error?.response?.data?.message ||
        'تعذر إلغاء الفاتورة';
      setCancelReasonError(apiMessage);
      toast.error(apiMessage);
    },
  });

  const ensureInvoiceDate = (invoiceId) => {
    if (!invoiceId || invoiceDateMap[invoiceId]) return;
    queryClient
      .fetchQuery(['sales-invoice', invoiceId], () => getSalesInvoice(invoiceId))
      .then((res) => {
        const payload = extractInvoicePayload(res) || {};
        const date = payload?.invoice_date ?? payload?.date ?? null;
        if (date) setInvoiceDateMap((prev) => ({ ...prev, [invoiceId]: date }));
      })
      .catch(() => { });
  };

  useEffect(() => {
    const rows = statementQuery.data?.rows || [];
    const ids = Array.from(
      new Set(rows.filter((r) => r.referenceId > 0 && isSalesInvoiceType(r.referenceType)).map((r) => r.referenceId))
    ).filter((id) => !invoiceDateMap[id]);

    if (ids.length === 0) return;

    ids.forEach(async (id) => {
      try {
        const res = await getSalesInvoice(id);
        const payload = extractInvoicePayload(res) || {};
        const date = payload?.invoice_date ?? payload?.date ?? null;
        if (date) setInvoiceDateMap((prev) => ({ ...prev, [id]: date }));
      } catch (e) {
        // ignore missing invoice
      }
    });
  }, [statementQuery.data?.rows, invoiceDateMap]);

  const invoiceDetailsQuery = useQuery({
    queryKey: ['customer-statement-invoice', selectedInvoice?.id],
    queryFn: async () => extractInvoicePayload(await getSalesInvoice(selectedInvoice.id)),
    enabled: Boolean(selectedInvoice?.id),
  });

  useEffect(() => {
    const data = invoiceDetailsQuery.data;
    if (!data || !selectedInvoice?.id) return;
    const date = data?.invoice_date ?? data?.date ?? null;
    if (date) setInvoiceDateMap((prev) => ({ ...prev, [selectedInvoice.id]: date }));
  }, [invoiceDetailsQuery.data, selectedInvoice?.id]);

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

      const refType = String(item?.reference_type ?? item?.referenceType ?? '').toLowerCase();
      const isPaymentRow =
        refType.includes('payment') || refType.includes('receipt') || refType.includes('customer_payment');

      const date = isPaymentRow
        ? item?.payment_date ?? item?.transaction_date ?? item?.date ?? null
        : item?.invoice_date ?? item?.date ?? item?.transaction_date ?? null;

      return {
        id: item?.id ?? `row-${index}`,
        date,
        description: item?.description ?? item?.statement ?? item?.notes ?? '—',
        debit,
        credit,
        balance: runningBalance,
        referenceType: item?.reference_type ?? item?.referenceType ?? null,
        referenceId: toNumber(item?.reference_id ?? item?.referenceId, 0),
        paymentNumber: item?.payment_number ?? item?.receipt_number ?? null,
        invoiceNumber: item?.invoice_number ?? null,
        isPaymentRow,
        raw: item,
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
      render: (value, row) => {
        const type = String(row.referenceType || '').toLowerCase();

        // Payment rows: use the date already resolved from payment_date/transaction_date.
        if (row.isPaymentRow) {
          return value ? formatDate(value) : '—';
        }

        // Invoice rows: prefer the invoice's own date fetched separately.
        if (row.referenceId > 0 && isSalesInvoiceType(type)) {
          if (invoiceDateMap[row.referenceId]) return formatDate(invoiceDateMap[row.referenceId]);
          ensureInvoiceDate(row.referenceId);
          return '—';
        }

        return value ? formatDate(value) : '—';
      },
    },
    {
      key: 'reference_number',
      label: 'الرقم',
      render: (_, row) => {
        return row.isPaymentRow 
          ? (row.paymentNumber || row.referenceId || '—')
          : (row.invoiceNumber || row.referenceId || '—');
      },
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
      label: 'العمليات',
      render: (_, row) => {
        const type = String(row.referenceType || '').toLowerCase();

        if (row.referenceId > 0 && isSalesInvoiceType(type)) {
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedInvoice({ id: row.referenceId })}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
                title="عرض الفاتورة"
              >
                <Eye className="h-4 w-4" />
              </button>

              <Link
                to={`/store/sales-invoices/${row.referenceId}/edit`}
                className="rounded-md p-1.5 text-primary hover:bg-primary/10"
                title="تعديل الفاتورة"
              >
                <Edit className="h-4 w-4" />
              </Link>

              <button
                type="button"
                onClick={() => {
                  setCancelInvoice({ id: row.referenceId, invoice_number: row.invoiceNumber });
                  setCancelReason('');
                  setCancelReasonError('');
                }}
                className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                title="إلغاء الفاتورة"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          );
        }

        if (row.referenceId > 0 && row.isPaymentRow) {
          // referenceId is the ACTUAL payment record ID — row.id is only the statement/journal-entry ID
          const paymentId = row.referenceId || (row.raw?.payment_id ?? row.raw?.id ?? row.id);
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedPayment(row)}
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
                title="عرض سند التحصيل"
              >
                <Eye className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedPayment(row);
                  const amount = row.debit || row.credit || row.raw?.amount || 0;
                  setEditAmount(String(amount));
                  setEditDate(row.date || row.raw?.date || '');
                  setEditNotes(row.description || row.raw?.notes || '');
                  setEditReceiptNumber(row.paymentNumber || row.raw?.payment_number || row.raw?.receipt_number || '');
                  setIsEditingPayment(true);
                }}
                className="rounded-md p-1.5 text-primary hover:bg-primary/10"
                title="تعديل السند"
              >
                <Edit className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={async () => {
                  const ok = window.confirm('هل متأكد من حذف سند التحصيل؟ لا يمكن التراجع');
                  if (!ok) return;
                  try {
                    await deletePayment(paymentId, row.referenceType);
                    toast.success('تم حذف السند');
                    queryClient.invalidateQueries({ queryKey: ['customers-statement', id] });
                    queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
                    queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
                  } catch (e) {
                    toast.error('فشل حذف السند');
                  }
                }}
                className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                title="حذف السند"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        }

        return '—';
      },
    },
  ];

  const invoiceDetails = invoiceDetailsQuery.data || {};
  const invoiceItems = Array.isArray(invoiceDetails?.items) ? invoiceDetails.items : [];

  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReceiptNumber, setEditReceiptNumber] = useState('');

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
          .no-print, .screen-only { display: none !important; }
          .print-only { display: block !important; }
          .print-card { box-shadow: none !important; border: none !important; }
          body { background: #fff !important; margin: 0 !important; padding: 0 !important; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif !important; }
          .print-area { padding: 0 !important; gap: 0 !important; }
          * { box-shadow: none !important; }

          .print-report { display: block !important; direction: rtl; }
          .print-report-header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #333; }
          .print-report-header h1 { font-size: 18px; font-weight: bold; margin: 0 0 2px 0; }
          .print-report-header h2 { font-size: 15px; font-weight: bold; margin: 0 0 2px 0; }
          .print-report-header p { font-size: 11px; margin: 0; color: #555; }

          .print-report table { width: 100%; border-collapse: collapse; font-size: 11px; }
          .print-report thead th {
            border-top: 1px solid #999;
            border-bottom: 1px solid #999;
            padding: 5px 8px;
            text-align: right;
            font-weight: bold;
            font-size: 11px;
            background: transparent;
          }
          .print-report thead th.col-num { text-align: center; }
          .print-report thead th.col-debit,
          .print-report thead th.col-credit,
          .print-report thead th.col-balance { text-align: left; }

          .print-report tbody td {
            padding: 3px 8px;
            border: none;
            font-size: 11px;
            vertical-align: top;
          }
          .print-report tbody td.col-num { text-align: center; }
          .print-report tbody td.col-debit,
          .print-report tbody td.col-credit,
          .print-report tbody td.col-balance { text-align: left; font-variant-numeric: tabular-nums; }

          .print-report .group-header td {
            font-weight: bold;
            padding-top: 8px;
            padding-bottom: 2px;
            font-size: 11px;
          }
          .print-report .indent-1 td:first-child { padding-right: 24px; }
          .print-report .indent-2 td:first-child { padding-right: 40px; }

          .print-report .total-row td {
            border-top: 1px solid #999;
            border-bottom: 1px solid #999;
            font-weight: bold;
            padding-top: 5px;
            padding-bottom: 5px;
          }
          .print-report .subtotal-row td {
            border-top: 1px solid #ccc;
            font-weight: bold;
            padding-top: 4px;
            padding-bottom: 4px;
          }
          .print-report .grand-total-row td {
            border-top: 2px solid #333;
            border-bottom: 2px solid #333;
            font-weight: bold;
            padding-top: 6px;
            padding-bottom: 6px;
            font-size: 12px;
          }

          @page { margin: 15mm 10mm; size: A4; }
        }`}
      </style>

      {/* ===== PRINT-ONLY REPORT (QuickBooks style) ===== */}
      <div className="print-report" style={{ display: 'none' }}>
        <div className="print-report-header">
          {store?.logo_url ? (
            <img src={store.logo_url} alt="شعار" style={{ height: 48, margin: '0 auto 6px', display: 'block', objectFit: 'contain' }} />
          ) : null}
          <h1>{store?.print_header || store?.name || 'المتجر'}</h1>
          <h2>كشف حساب تفصيلي</h2>
          <p>حتى {formatDate(range.to)}</p>
          {store?.print_phone ? <p>هاتف: {store.print_phone}</p> : null}
          {store?.print_address ? <p>{store.print_address}</p> : null}
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '12%' }}>النوع</th>
              <th style={{ width: '12%' }}>التاريخ</th>
              <th className="col-num" style={{ width: '8%' }}>الرقم</th>
              <th className="col-debit" style={{ width: '15%' }}>مدين</th>
              <th className="col-credit" style={{ width: '15%' }}>دائن</th>
              <th className="col-balance" style={{ width: '15%' }}>الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row */}
            {statementRows.length > 0 && (() => {
              const firstRow = statementRows[0];
              const openingBalance = firstRow.balance - firstRow.debit + firstRow.credit;
              return openingBalance !== 0 ? (
                <tr className="group-header">
                  <td colSpan="5"></td>
                  <td className="col-balance">{formatNumber(openingBalance)}</td>
                </tr>
              ) : null;
            })()}
            {/* Customer group header */}
            <tr className="group-header">
              <td colSpan="6" style={{ paddingRight: 8 }}>{customerName}</td>
            </tr>

            {/* Transaction rows */}
            {statementRows.map((row) => {
              const dateVal = (() => {
                // Payment rows: date already resolved from payment_date/transaction_date.
                if (row.isPaymentRow) {
                  return row.date ? formatDate(row.date) : '—';
                }
                // Invoice rows: prefer fetched invoice date.
                if (row.referenceId > 0 && isSalesInvoiceType(String(row.referenceType || ''))) {
                  if (invoiceDateMap[row.referenceId]) return formatDate(invoiceDateMap[row.referenceId]);
                }
                return row.date ? formatDate(row.date) : '—';
              })();

              return (
                <tr key={row.id} className="indent-1">
                  <td>{getTypeLabel(row.referenceType)}</td>
                  <td>{dateVal}</td>
                  <td className="col-num">
                    {row.isPaymentRow 
                      ? (row.paymentNumber || row.referenceId)
                      : (row.invoiceNumber || row.referenceId || '')}
                  </td>
                  <td className="col-debit">{formatNumber(row.debit)}</td>
                  <td className="col-credit">{formatNumber(row.credit)}</td>
                  <td className="col-balance">{formatNumber(row.balance)}</td>
                </tr>
              );
            })}

            {/* Customer subtotal */}
            <tr className="subtotal-row indent-1">
              <td colSpan="3">إجمالي {customerName}</td>
              <td className="col-debit">{formatNumber(totals.debit)}</td>
              <td className="col-credit">{formatNumber(totals.credit)}</td>
              <td className="col-balance">{formatNumber(totals.closing)}</td>
            </tr>

            {/* Grand total */}
            <tr className="grand-total-row">
              <td colSpan="3">الإجمالي</td>
              <td className="col-debit">{formatNumber(totals.debit)}</td>
              <td className="col-credit">{formatNumber(totals.credit)}</td>
              <td className="col-balance">{formatNumber(totals.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ===== SCREEN-ONLY SECTIONS ===== */}
      <div className="screen-only rounded-xl border border-border bg-white p-4 print-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

      <div className="screen-only rounded-xl border border-border bg-white p-4">
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

      <div className="screen-only">
        {statementQuery.isLoading ? (
          <LoadingSpinner />
        ) : (
          <DataTable columns={columns} data={statementRows} loading={statementQuery.isFetching} emptyMessage="لا توجد حركات" />
        )}
      </div>

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

      <div className="screen-only rounded-xl border border-border bg-white p-4 text-sm">
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
                <div>التاريخ: {formatDate(invoiceDetails?.invoice_date ?? invoiceDetails?.date ?? null)}</div>
                <div>الإجمالي: {formatCurrency(invoiceDetails?.total_amount || 0)}</div>
                <div>المدفوع: {formatCurrency(invoiceDetails?.paid_amount || 0)}</div>
              </div>

              <DataTable
                columns={invoiceItemsColumns}
                data={invoiceItems}
                loading={invoiceDetailsQuery.isFetching}
                emptyMessage="لا توجد أصناف"
              />

              <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedInvoice(null)}
                >
                  إغلاق
                </Button>

                {invoiceDetails?.status === 'confirmed' && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        navigate(`/store/sales-invoices/${selectedInvoice.id}/edit`);
                        setSelectedInvoice(null);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <Edit className="h-4 w-4" />
                      <span>تعديل</span>
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setCancelInvoice({ id: selectedInvoice.id, invoice_number: invoiceDetails?.invoice_number });
                        setSelectedInvoice(null);
                        setCancelReason('');
                        setCancelReasonError('');
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>إلغاء الفاتورة</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selectedPayment)} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل سند التحصيل</DialogTitle>
          </DialogHeader>

          {selectedPayment ? (
            <div className="space-y-3">
              {!isEditingPayment ? (
                <>
                  <div className="text-sm">البيان: {selectedPayment.description || selectedPayment.raw?.notes || '—'}</div>
                  <div className="text-sm">التاريخ: {formatDate(selectedPayment.date)}</div>
                  <div className="text-sm">المبلغ: {formatCurrency(selectedPayment.debit || selectedPayment.credit || selectedPayment.raw?.amount || 0)}</div>
                  <div className="text-sm">مرجع الفاتورة: {selectedPayment.referenceId ? `#${selectedPayment.referenceId}` : '—'}</div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const amount = selectedPayment.debit || selectedPayment.credit || selectedPayment.raw?.amount || 0;
                        setEditAmount(String(amount));
                        setEditDate(selectedPayment.date || selectedPayment.raw?.date || '');
                        setEditNotes(selectedPayment.description || selectedPayment.raw?.notes || '');
                        setEditReceiptNumber(selectedPayment.paymentNumber || selectedPayment.raw?.payment_number || selectedPayment.raw?.receipt_number || '');
                        setIsEditingPayment(true);
                      }}
                    >
                      تعديل
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={async () => {
                        const ok = window.confirm('هل متأكد من حذف سند التحصيل؟ لا يمكن التراجع');
                        if (!ok) return;
                        // referenceId is the ACTUAL payment record ID
                        const paymentId = selectedPayment?.referenceId || (selectedPayment?.raw?.payment_id ?? selectedPayment?.raw?.id ?? selectedPayment?.id) || null;
                        if (!paymentId) {
                          toast.error('لا يوجد معرف صالح للسند للحذف');
                          return;
                        }
                        try {
                          await deletePayment(paymentId, selectedPayment.referenceType);
                          toast.success('تم حذف السند');
                          setSelectedPayment(null);
                          queryClient.invalidateQueries({ queryKey: ['customers-statement', id] });
                          queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
                          queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
                        } catch (e) {
                          toast.error('فشل حذف السند');
                        }
                      }}
                    >
                      حذف
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">المبلغ</label>
                    <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">التاريخ</label>
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">رقم السند</label>
                    <Input value={editReceiptNumber} onChange={(e) => setEditReceiptNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">البيان</label>
                    <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      onClick={async () => {
                        try {
                          const payload = {
                            amount: Number(editAmount) || 0,
                            transaction_date: editDate || undefined,
                            description: editNotes || undefined,
                          };
                          // referenceId is the ACTUAL payment record ID
                          const paymentId = selectedPayment?.referenceId || (selectedPayment?.raw?.payment_id ?? selectedPayment?.raw?.id ?? selectedPayment?.id) || null;
                          if (!paymentId) {
                            toast.error('لا يوجد معرف صالح للسند للحفظ');
                            return;
                          }
                          await updatePayment(paymentId, payload, selectedPayment.referenceType);
                          toast.success('تم تعديل السند');
                          setIsEditingPayment(false);
                          setSelectedPayment(null);
                          queryClient.invalidateQueries({ queryKey: ['customers-statement', id] });
                          queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
                          queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
                        } catch (e) {
                          toast.error('فشل حفظ التعديلات');
                        }
                      }}
                    >
                      حفظ
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsEditingPayment(false)}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <LoadingSpinner />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelInvoice)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelInvoice(null);
            setCancelReason('');
            setCancelReasonError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إلغاء الفاتورة رقم {cancelInvoice?.invoice_number || `INV-${cancelInvoice?.id || ''}`}</DialogTitle>
            <DialogDescription>سيتم عكس المخزون والقيود المالية</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text">سبب الإلغاء *</label>
            <textarea
              value={cancelReason}
              onChange={(event) => {
                setCancelReason(event.target.value);
                if (cancelReasonError) setCancelReasonError('');
              }}
              rows={4}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="اكتب سبب الإلغاء"
            />
            {cancelReasonError ? <p className="text-sm text-danger">{cancelReasonError}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCancelInvoice(null);
                setCancelReason('');
                setCancelReasonError('');
              }}
              disabled={cancelMutation.isPending}
            >
              إلغاء
            </Button>

            <Button
              type="button"
              onClick={() => {
                const reason = cancelReason.trim();
                if (!reason) {
                  setCancelReasonError('سبب الإلغاء مطلوب');
                  return;
                }
                cancelMutation.mutate({ id: cancelInvoice.id, reason });
              }}
              disabled={cancelMutation.isPending}
              className="bg-danger text-white hover:bg-red-700 focus-visible:ring-danger"
            >
              {cancelMutation.isPending ? 'جاري التنفيذ...' : 'تأكيد الإلغاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}