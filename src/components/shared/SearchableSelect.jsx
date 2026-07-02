import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';

const extractItems = (response) => {
  const payload = response?.data?.data ?? response?.data ?? [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.customers)) return payload.customers;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(response?.data?.products)) return response.data.products;
  if (Array.isArray(response?.data?.customers)) return response.data.customers;
  if (Array.isArray(payload)) return payload;
  return [];
};

export default function SearchableSelect({
  value,
  onChange,
  fetchFn,
  queryKey,
  placeholder,
  renderOption,
  renderSelected,
  error,
  disabled,
  initialSelected,
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedCache, setSelectedCache] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, debouncedSearch],
    queryFn: () => fetchFn(debouncedSearch),
    enabled: open && !disabled,
    keepPreviousData: true,
  });

  const items = useMemo(() => extractItems(data), [data]);

  useEffect(() => {
    const onMouseDown = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!value) {
      setSelectedCache(null);
    }
  }, [value]);

  useEffect(() => {
    if (initialSelected && value && Number(initialSelected?.id) === Number(value)) {
      setSelectedCache(initialSelected);
    }
  }, [initialSelected, value]);

  const selectedItem = useMemo(() => {
    if (!value) return null;
    const fromList = items.find((item) => Number(item?.id) === Number(value));
    if (fromList) return fromList;
    if (selectedCache && Number(selectedCache?.id) === Number(value)) return selectedCache;
    return null;
  }, [items, selectedCache, value]);

  const handleSelect = (item) => {
    setSelectedCache(item);
    onChange?.(item?.id ?? null, item || null);
    setSearch('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleClear = (event) => {
    event.stopPropagation();
    setSelectedCache(null);
    setSearch('');
    onChange?.(null, null);
    inputRef.current?.focus();
    setOpen(true);
  };

  const handleKeyDown = (event) => {
    if (!open) {
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        setOpen(true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }

    if (event.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      handleSelect(items[activeIndex]);
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex h-11 w-full cursor-text items-center gap-2 rounded-lg border px-3 ${
          error ? 'border-red-500' : 'border-border'
        } ${
          disabled ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'bg-white hover:border-primary'
        } focus-within:border-primary focus-within:ring-2 focus-within:ring-primary`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {value ? (
          <Check size={16} className="shrink-0 text-primary" />
        ) : (
          <Search size={16} className="shrink-0 text-text-muted" />
        )}

        {value && !open ? (
          <span className="flex-1 truncate text-sm text-text">{selectedItem ? renderSelected(selectedItem) : '...'}</span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (!open) setOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            placeholder={value ? '' : placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
        )}

        {isLoading && open ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-text-muted" />
        ) : value ? (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 text-text-muted hover:text-danger"
            aria-label="مسح الاختيار"
          >
            <X size={16} />
          </button>
        ) : (
          <ChevronDown size={16} className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </div>

      {open ? (
        <div className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              جاري البحث...
            </div>
          ) : items.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-muted">لا توجد نتائج</div>
          ) : (
            items.map((item, index) => (
              <div
                key={item?.id ?? index}
                onMouseDown={() => handleSelect(item)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                  index === activeIndex ? 'bg-primary/10 text-primary' : 'text-text hover:bg-slate-50'
                } ${Number(item?.id) === Number(value) ? 'font-medium text-primary' : ''}`}
              >
                <span>{renderOption(item)}</span>
                {Number(item?.id) === Number(value) ? <Check size={14} className="text-primary" /> : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
