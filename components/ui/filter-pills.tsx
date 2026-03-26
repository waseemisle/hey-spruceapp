'use client';

export interface FilterPillOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterPillsProps<T extends string> {
  options: FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function FilterPills<T extends string>({ options, value, onChange, className = '' }: FilterPillsProps<T>) {
  return (
    <div className={`flex items-center gap-1 bg-muted rounded-lg p-1 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
            value === opt.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label} {opt.count !== undefined ? `(${opt.count})` : ''}
        </button>
      ))}
    </div>
  );
}
