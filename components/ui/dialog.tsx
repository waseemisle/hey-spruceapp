'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { cn } from '@/lib/utils';

type DialogContextValue = {
  open: boolean;
  setOpen?: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const value = useMemo(() => ({ open, setOpen: onOpenChange }), [open, onOpenChange]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

type DialogTriggerProps = {
  asChild?: boolean;
  children: React.ReactElement;
};

export function DialogTrigger({ asChild, children }: DialogTriggerProps) {
  const ctx = useContext(DialogContext);
  if (!ctx) return children;

  const handleClick = () => ctx.setOpen?.(!ctx.open);

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      ...child.props,
      onClick: (e: React.MouseEvent) => {
        child.props?.onClick?.(e);
        handleClick();
      },
    });
  }

  return (
    <button onClick={handleClick} className="inline-flex items-center">
      {children}
    </button>
  );
}

type DialogContentProps = {
  children: React.ReactNode;
  className?: string;
};

export function DialogContent({ children, className }: DialogContentProps) {
  const ctx = useContext(DialogContext);
  if (!ctx?.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => ctx.setOpen?.(false)} />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-lg max-h-[min(92dvh,92vh)] flex-col overflow-hidden rounded-lg bg-card shadow-lg',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

type SimpleProps = {
  children?: React.ReactNode;
  className?: string;
};

export function DialogHeader({ children, className }: SimpleProps) {
  return <div className={`space-y-1 ${className || ''}`}>{children}</div>;
}

export function DialogFooter({ children, className }: SimpleProps) {
  return <div className={`mt-4 flex justify-end gap-2 ${className || ''}`}>{children}</div>;
}

export function DialogTitle({ children, className }: SimpleProps) {
  return <h3 className={`text-lg font-semibold leading-none tracking-tight ${className || ''}`}>{children}</h3>;
}

export function DialogDescription({ children, className }: SimpleProps) {
  return <p className={`text-sm text-muted-foreground ${className || ''}`}>{children}</p>;
}

