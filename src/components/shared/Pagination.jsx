import { ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_PER_PAGE = 10;

export default function Pagination({
  currentPage,
  lastPage,
  total,
  perPage = DEFAULT_PER_PAGE,
  onPageChange,
  isLoading = false,
  itemLabel = 'منتج',
}) {
  const safeCurrent = Math.max(1, Number(currentPage) || 1);
  const safeLast = Math.max(1, Number(lastPage) || 1);
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePerPage = Math.max(1, Number(perPage) || DEFAULT_PER_PAGE);

  const getPageNumbers = () => {
    const pages = [];
    const delta = 2;

    const rangeStart = Math.max(2, safeCurrent - delta);
    const rangeEnd = Math.min(safeLast - 1, safeCurrent + delta);

    pages.push(1);

    if (rangeStart > 2) pages.push('...');

    for (let page = rangeStart; page <= rangeEnd; page += 1) {
      pages.push(page);
    }

    if (rangeEnd < safeLast - 1) pages.push('...');

    if (safeLast > 1) pages.push(safeLast);

    return pages;
  };

  const from = safeTotal === 0 ? 0 : (safeCurrent - 1) * safePerPage + 1;
  const to = Math.min(safeCurrent * safePerPage, safeTotal);

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <p className="text-sm text-gray-500">
        عرض {from.toLocaleString('ar-EG')} إلى {to.toLocaleString('ar-EG')} من أصل{' '}
        <span className="font-bold text-gray-700">{safeTotal.toLocaleString('ar-EG')}</span> {itemLabel}
      </p>

      <div className={`flex flex-row-reverse items-center gap-1 ${isLoading ? 'pointer-events-none opacity-50' : ''}`}>
        <button
          type="button"
          onClick={() => onPageChange(safeCurrent + 1)}
          disabled={safeCurrent === safeLast}
          className="flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} />
          التالي
        </button>

        {getPageNumbers().map((page, index) =>
          page === '...' ? (
            <span key={`dots-${index}`} className="select-none px-2 py-2 text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`h-9 w-9 rounded border text-sm font-medium transition-colors ${
                page === safeCurrent
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white hover:border-primary hover:text-primary'
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(safeCurrent - 1)}
          disabled={safeCurrent === 1}
          className="flex items-center gap-1 rounded border px-3 py-2 text-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          السابق
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}