'use client';

import React from 'react';

type AvatarProps = {
  className?: string;
  children?: React.ReactNode;
};

export function Avatar({ className, children }: AvatarProps) {
  return (
    <div className={`inline-flex h-10 w-10 overflow-hidden rounded-full bg-muted ${className || ''}`}>
      {children}
    </div>
  );
}

type AvatarImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

export function AvatarImage(props: AvatarImageProps) {
  return <img {...props} className={`h-full w-full object-cover ${props.className || ''}`} />;
}

type AvatarFallbackProps = {
  children: React.ReactNode;
  className?: string;
};

export function AvatarFallback({ children, className }: AvatarFallbackProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground ${className || ''}`}>
      {children}
    </div>
  );
}

