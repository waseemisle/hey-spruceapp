'use client';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/** Wraps page content with consistent spacing (matches admin-portal/subcontractors page). */
export function PageContainer({ children, className = '' }: PageContainerProps) {
  return <div className={`space-y-6 ${className}`}>{children}</div>;
}
