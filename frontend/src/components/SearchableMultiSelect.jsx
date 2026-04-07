import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export default function SearchableMultiSelect({
  options = [],
  selectedIds = [],
  onChange,
  placeholder = 'Select items',
  searchPlaceholder = 'Search',
  emptyText = 'No results',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    const onOutside = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const selected = useMemo(
    () => options.filter((opt) => selectedIds.includes(opt.id)),
    [options, selectedIds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      [opt.name, opt.email, opt.phone].join(' ').toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (id) => {
    const exists = selectedIds.includes(id);
    const next = exists ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange(next);
  };

  const removeSelected = (id) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="input flex min-h-11 items-center justify-between gap-3 text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate text-sm text-[#dfe6f2]">
          {selected.length ? `${selected.length} selected` : placeholder}
        </span>
        <ChevronDown size={16} className={`text-[#8e9aaf] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.slice(0, 4).map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-[#2c3644] bg-[#17202d] px-2 py-0.5 text-xs text-[#dbe4f0]"
            >
              <span className="max-w-32 truncate">{item.name}</span>
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-[#253243]"
                onClick={() => removeSelected(item.id)}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {selected.length > 4 && (
            <span className="inline-flex items-center rounded-full border border-[#303a47] bg-[#141c27] px-2 py-0.5 text-xs text-[#9eabbd]">
              +{selected.length - 4} more
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-[#2d3746] bg-[#111925] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="border-b border-[#25303d] p-2.5">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-[#8593a8]" />
              <input
                className="input pl-8"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-auto p-2">
            {!filtered.length && <p className="px-2 py-2 text-sm text-[#8f9aac]">{emptyText}</p>}
            {filtered.map((option) => {
              const checked = selectedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    checked ? 'bg-[#1f2b3b] text-[#eef3fb]' : 'text-[#dce4ef] hover:bg-[#1a2330]'
                  }`}
                  onClick={() => toggle(option.id)}
                >
                  <span className="truncate">
                    {option.name}
                    {option.email ? ` • ${option.email}` : ''}
                  </span>
                  {checked && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
