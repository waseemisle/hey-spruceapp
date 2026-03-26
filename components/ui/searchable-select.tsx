'use client';

import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchableSelectOption = { value: string; label: string; disabled?: boolean };

const TRIGGER =
  'min-h-[42px] border border-border rounded-lg px-3 py-2 flex items-center gap-2 bg-background';
const TRIGGER_FOCUS = 'cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:border-ring';
const PANEL =
  'absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-auto';

export interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  emptyMessage?: string;
  'aria-label'?: string;
  triggerClassName?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled,
  className,
  id: idProp,
  emptyMessage = 'No results',
  'aria-label': ariaLabel,
  triggerClassName,
}: SearchableSelectProps) {
  const uid = React.useId();
  const inputId = idProp ?? uid;
  const listboxId = `${inputId}-listbox`;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery('');
      }
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openDropdown = React.useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setSearchQuery('');
    queueMicrotask(() => inputRef.current?.focus());
  }, [disabled]);

  const displayInput = open ? searchQuery : (selected?.label ?? value ?? '');

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          TRIGGER,
          !disabled && TRIGGER_FOCUS,
          disabled && 'opacity-50 cursor-not-allowed bg-muted',
          triggerClassName
        )}
        onClick={() => !disabled && openDropdown()}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-controls={open ? listboxId : undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={displayInput}
          readOnly={!open}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled && !open) openDropdown();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setSearchQuery('');
              inputRef.current?.blur();
            } else if (e.key === 'Enter' && open) {
              const first = filtered.find((o) => !o.disabled);
              if (first) {
                e.preventDefault();
                onValueChange(first.value);
                setOpen(false);
                setSearchQuery('');
              }
            }
          }}
          className="flex-1 min-w-0 outline-none text-sm bg-transparent"
          autoComplete="off"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (open) {
              setOpen(false);
              setSearchQuery('');
            } else {
              openDropdown();
            }
          }}
          className="text-muted-foreground hover:text-muted-foreground shrink-0"
          tabIndex={-1}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div id={listboxId} role="listbox" className={PANEL}>
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground text-center">{emptyMessage}</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  disabled={opt.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onValueChange(opt.value);
                    setOpen(false);
                    setSearchQuery('');
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex items-center justify-between transition-colors',
                    opt.value === value && 'bg-blue-50/80',
                    opt.disabled && 'opacity-50 pointer-events-none'
                  )}
                >
                  {opt.label}
                  {opt.value === value && <span className="text-blue-600 text-xs">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SearchableMultiSelectProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  addMorePlaceholder?: string;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  noMoreMessage?: string;
}

export function SearchableMultiSelect({
  values,
  onValuesChange,
  options,
  placeholder = 'Type to search...',
  addMorePlaceholder = 'Add more...',
  disabled,
  className,
  emptyMessage = 'No results',
  noMoreMessage = 'No more options available',
}: SearchableMultiSelectProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return options.filter(
      (o) =>
        !values.includes(o.value) &&
        !o.disabled &&
        (q === '' || o.label.toLowerCase().includes(q))
    );
  }, [options, values, searchQuery]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (v: string) => {
    if (values.includes(v)) onValuesChange(values.filter((x) => x !== v));
    else onValuesChange([...values, v]);
    setSearchQuery('');
  };

  const remove = (v: string) => {
    onValuesChange(values.filter((x) => x !== v));
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className={cn(
          'min-h-[42px] border border-border rounded-lg px-3 py-2 flex flex-wrap gap-2 items-center bg-background',
          !disabled && 'cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:border-ring',
          disabled && 'opacity-50 cursor-not-allowed bg-muted'
        )}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {values.map((v) => {
          const label = options.find((o) => o.value === v)?.label ?? v;
          return (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs"
            >
              {label}
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(v);
                }}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          placeholder={values.length === 0 ? placeholder : addMorePlaceholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            } else if (e.key === 'Enter' && filtered.length > 0) {
              e.preventDefault();
              toggle(filtered[0].value);
            }
          }}
          className="flex-1 min-w-[150px] outline-none text-sm bg-transparent"
          autoComplete="off"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="text-muted-foreground hover:text-muted-foreground ml-auto shrink-0"
          tabIndex={-1}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && !disabled && (
        <div className={PANEL}>
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                {searchQuery.trim() ? emptyMessage : noMoreMessage}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(opt.value);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex items-center justify-between transition-colors"
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
