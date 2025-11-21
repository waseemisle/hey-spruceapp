'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Sort by</Label>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
            className="border border-input rounded-md p-2 bg-background text-sm"
          >
            <option value="createdAt">Created At</option>
            <option value="updatedAt">Last Modified</option>
          </select>
        </div>
      )}
    </div>
  );
}

