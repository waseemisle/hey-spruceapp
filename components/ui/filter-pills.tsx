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
    <div className={`flex items-center gap-1 bg-gray-100 rounded-lg p-1 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
            value === opt.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label} {opt.count !== undefined ? `(${opt.count})` : ''}
        </button>
      ))}
    </div>
  );
}
