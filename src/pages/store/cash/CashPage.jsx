import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Calendar, Landmark, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCashBalance, getCashDailyReport, setOpeningBalance } from '../../../api/cash';
import DataTable from '../../../components/shared/DataTable';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import PageHeader from '../../../components/shared/PageHeader';
import PaginationControls from '../../../components/shared/PaginationControls';
import StatsCard from '../../../components/shared/StatsCard';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatCurrency, formatDate } from '../../../utils/formatters';

const OPENING_BALANCE_SET_KEY = 'cash_opening_balance_set';

const getTodayDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractPayload = (response) => response?.data?.data ?? response?.data ?? {};

const pickFirstDefined = (values) => values.find((value) => value !== null && value !== undefined);

const getOpeningBalanceStatus = (payload) => {
  const explicitBoolean = pickFirstDefined([
    typeof payload?.has_opening_balance === 'boolean' ? payload.has_opening_balance : undefined,
    typeof payload?.hasOpeningBalance === 'boolean' ? payload.hasOpeningBalance : undefined,
    typeof payload?.opening_balance_set === 'boolean' ? payload.opening_balance_set : undefined,
    typeof payload?.openingBalanceSet === 'boolean' ? payload.openingBalanceSet : undefined,
    typeof payload?.is_opening_balance_set === 'boolean' ? payload.is_opening_balance_set : undefined,
    typeof payload?.isOpeningBalanceSet === 'boolean' ? payload.isOpeningBalanceSet : undefined,
  ]);

  const openingBalanceValue = pickFirstDefined([
    payload?.opening_balance,
    payload?.openingBalance,
    payload?.opening_balance_amount,
    payload?.openingBalanceAmount,
    payload?.initial_balance,
    payload?.initialBalance,
  ]);

  const hasOpeningByValue = openingBalanceValue !== null && openingBalanceValue !== undefined && openingBalanceValue !== '';

  return {
    hasOpeningBalance: typeof explicitBoolean === 'boolean' ? explicitBoolean : hasOpeningByValue,
  };
};

export default function CashPage() {
  const queryClient = useQueryClient();
  const [reportDate, setReportDate] = useState(getTodayDate());
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingBalanceAlreadySet, setOpeningBalanceAlreadySet] = useState(
    () => localStorage.getItem(OPENING_BALANCE_SET_KEY) === '1'
  );
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const balanceQuery = useQuery({
    queryKey: ['cash-balance'],
    queryFn: async () => extractPayload(await getCashBalance()),
  });

  const reportQuery = useQuery({
    queryKey: ['cash-daily-report', reportDate, page, perPage],
    queryFn: async () =>
      extractPayload(
        await getCashDailyReport({
          date: reportDate,
          page,
          per_page: perPage,
        })
      ),
    keepPreviousData: true,
  });

  const openingBalanceMutation = useMutation({
    mutationFn: (amount) => setOpeningBalance({ amount }),
    onSuccess: () => {
      toast.success('تم تسجيل الرصيد الافتتاحي بنجاح');
      setOpeningBalanceAlreadySet(true);
      localStorage.setItem(OPENING_BALANCE_SET_KEY, '1');
      setOpeningAmount('');
      queryClient.invalidateQueries({ queryKey: ['cash-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily-report'] });
    },
    onError: (error) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.errors?.opening_balance?.[0] ||
        'تعذر تسجيل الرصيد الافتتاحي';

      const normalizedMessage = String(message).trim();
      const isAlreadySetError =
        normalizedMessage.includes('تم تسجيل الرصيد الافتتاحي مسبق') ||
        normalizedMessage.includes('already set');

      if (isAlreadySetError) {
        setOpeningBalanceAlreadySet(true);
        localStorage.setItem(OPENING_BALANCE_SET_KEY, '1');
        queryClient.invalidateQueries({ queryKey: ['cash-balance'] });
      }

      toast.error(normalizedMessage);
    },
  });

  const balancePayload = balanceQuery.data || {};
  const reportPayload = useMemo(() => reportQuery.data || {}, [reportQuery.data]);
  const openingBalanceStatus = useMemo(() => getOpeningBalanceStatus(balancePayload), [balancePayload]);

  const currentBalance = toNumber(balancePayload?.current_balance ?? balancePayload?.balance);
  const hasOpeningBalance = openingBalanceAlreadySet || openingBalanceStatus.hasOpeningBalance;

  useEffect(() => {
    if (hasOpeningBalance) {
      localStorage.setItem(OPENING_BALANCE_SET_KEY, '1');

      if (!openingBalanceAlreadySet) {
        setOpeningBalanceAlreadySet(true);
      }
    }
  }, [hasOpeningBalance, openingBalanceAlreadySet]);

  const inToday = toNumber(reportPayload?.total_in ?? reportPayload?.in ?? reportPayload?.incoming);
  const outToday = toNumber(reportPayload?.total_out ?? reportPayload?.out ?? reportPayload?.outgoing);
  const netToday = toNumber(reportPayload?.net ?? inToday - outToday);
  const transactionsPayload = reportPayload?.transactions;

  const transactions = useMemo(() => {
    let raw = [];

    if (Array.isArray(transactionsPayload?.data)) {
      raw = transactionsPayload.data;
    } else if (Array.isArray(reportPayload?.entries)) {
      raw = reportPayload.entries;
    } else if (Array.isArray(reportPayload?.data)) {
      raw = reportPayload.data;
    }

    return Array.isArray(raw) ? raw : [];
  }, [reportPayload, transactionsPayload]);

  const pagination = {
    page: toNumber(transactionsPayload?.current_page ?? transactionsPayload?.page, page),
    perPage: toNumber(transactionsPayload?.per_page ?? transactionsPayload?.perPage, perPage),
    total: toNumber(transactionsPayload?.total, transactions.length),
    lastPage: toNumber(transactionsPayload?.last_page ?? transactionsPayload?.lastPage, 1),
  };

  const columns = [
    {
      key: 'time',
      label: 'الوقت',
      render: (value, row) => value || row?.transaction_date?.split('T')?.[1]?.slice(0, 8) || row?.created_at?.split('T')?.[1]?.slice(0, 8) || '—',
    },
    {
      key: 'type',
      label: 'النوع',
      render: (value) => {
        const normalizedValue = String(value || '').toLowerCase();
        const isIn = normalizedValue === 'in' || normalizedValue === 'قبض' || normalizedValue === 'وارد';
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isIn ? 'وارد' : 'صادر'}
          </span>
        );
      },
    },
    {
      key: 'description',
      label: 'البيان',
      render: (value) => value || '—',
    },
    {
      key: 'amount',
      label: 'المبلغ',
      render: (value) => formatCurrency(toNumber(value)),
    },
  ];

  const rowClassName = (row) => {
    const normalizedType = String(row?.type || '').toLowerCase();
    const isIn = normalizedType === 'in' || normalizedType === 'قبض' || normalizedType === 'وارد';
    return isIn ? 'bg-green-50/60' : 'bg-red-50/60';
  };

  if (balanceQuery.isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader title="الخزنة النقدي" subtitle="متابعة الحركة النقدية اليومية" />

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="الرصيد الحالي" value={formatCurrency(currentBalance)} icon={Wallet} color="blue" />
        <StatsCard title="وارد اليوم" value={formatCurrency(inToday)} icon={ArrowDownCircle} color="green" />
        <StatsCard title="صادر اليوم" value={formatCurrency(outToday)} icon={ArrowUpCircle} color="red" />
        <StatsCard title="صافي اليوم" value={formatCurrency(netToday)} icon={Landmark} color={netToday >= 0 ? 'green' : 'amber'} />
      </div>

      {!hasOpeningBalance ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">لم يتم تسجيل الرصيد الافتتاحي بعد</span>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-amber-900">المبلغ</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
                className="bg-white"
              />
            </div>
            <Button
              type="button"
              disabled={openingBalanceMutation.isPending}
              onClick={() => {
                const amount = Number(openingAmount);
                if (!Number.isFinite(amount) || amount < 0) {
                  toast.error('أدخل مبلغًا صحيحًا');
                  return;
                }

                openingBalanceMutation.mutate(amount);
              }}
            >
              {openingBalanceMutation.isPending ? 'جاري التسجيل...' : 'تسجيل الرصيد الافتتاحي'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-border bg-white p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-text-muted">
          <Calendar className="h-4 w-4" />
          <span>تقرير اليوم</span>
        </div>

        <Input
          type="date"
          value={reportDate}
          onChange={(event) => {
            setReportDate(event.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>

      {reportQuery.isLoading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={columns}
          data={transactions.map((item, index) => ({
            id: item.id ?? index,
            time: item.time || item.transaction_date?.split('T')?.[1]?.slice(0, 8) || item.created_at?.split('T')?.[1]?.slice(0, 8),
            type: item.type || item.transaction_type || item.direction,
            description: item.description || item.notes || (item.date ? formatDate(item.date) : ''),
            amount: item.amount,
          }))}
          loading={reportQuery.isFetching}
          rowClassName={rowClassName}
          emptyMessage="لا توجد حركات لليوم المحدد"
        />
      )}

      <PaginationControls
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
    </div>
  );
}
