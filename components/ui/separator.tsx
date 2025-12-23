'use client';

import React from 'react';

type SeparatorProps = {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
};

export function Separator({ className, orientation = 'horizontal' }: SeparatorProps) {
  const base = 'bg-border';
  const size = orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full';
  return <div className={`${base} ${size} ${className || ''}`} />;
}

