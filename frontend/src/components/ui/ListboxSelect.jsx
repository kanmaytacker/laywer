import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function ListboxSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  disabled = false,
  className = '',
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOutside = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const selected = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value],
  );

  return (
    <div className={`relative ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="input flex h-[38px] items-center justify-between gap-3 text-left"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={`truncate ${selected ? 'text-[#e7edf6]' : 'text-[#8f9aac]'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={14} className={`text-[#8f9aac] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-lg border border-[#2d3746] bg-[#141a23] shadow-[0_8px_25px_rgba(0,0,0,0.35)]">
          <div className="max-h-60 overflow-auto p-1.5">
            {!options.length && <p className="px-2 py-2 text-xs text-[#8f9aac]">No options</p>}
            {options.map((option) => {
              const isActive = String(option.value) === String(value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${
                    isActive
                      ? 'bg-[#253042] text-[#f0f5fc]'
                      : 'text-[#d4deea] hover:bg-[#1b2330]'
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {isActive && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
