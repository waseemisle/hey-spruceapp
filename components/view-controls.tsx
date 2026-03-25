'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useViewControls } from '@/contexts/view-controls-context';
import { cn } from '@/lib/utils';
import { LayoutGrid, List as ListIcon } from 'lucide-react';

interface ViewControlsProps {
  className?: string;
  size?: 'sm' | 'md';
  hideSort?: boolean;
}

export default function ViewControls({
  className,
  size = 'sm',
  hideSort = false,
}: ViewControlsProps) {
  const { viewMode, setViewMode, sortOption, setSortOption } = useViewControls();

  const buttonSize = size === 'md' ? 'default' : 'sm';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 md:flex-row md:items-center md:justify-between',
        className
      )}
    >
      <div className="flex gap-2">
        <Button
          size={buttonSize as 'sm' | 'default'}
          variant={viewMode === 'grid' ? 'default' : 'outline'}
          onClick={() => setViewMode('grid')}
          className="flex items-center gap-2"
        >
          <LayoutGrid className="h-4 w-4" />
          Grid
        </Button>
        <Button
          size={buttonSize as 'sm' | 'default'}
          variant={viewMode === 'list' ? 'default' : 'outline'}
          onClick={() => setViewMode('list')}
          className="flex items-center gap-2"
        >
          <ListIcon className="h-4 w-4" />
          List
        </Button>
      </div>

      {!hideSort && (
        <div className="flex items-center gap-2 min-w-0">
          <Label className="text-sm text-muted-foreground shrink-0">Sort by</Label>
          <SearchableSelect
            className="w-[min(100%,11rem)]"
            value={sortOption}
            onValueChange={(v) => setSortOption(v as typeof sortOption)}
            options={[
              { value: 'createdAt', label: 'Created At' },
              { value: 'updatedAt', label: 'Last Modified' },
            ]}
            placeholder="Sort..."
            aria-label="Sort by"
          />
        </div>
      )}
    </div>
  );
}

