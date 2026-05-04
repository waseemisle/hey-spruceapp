import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  href?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * When true, the wordmark text "GroundOps" is rendered next to the
   * mark. Useful in narrow headers; defaults to false (mark only).
   */
  showWordmark?: boolean;
}

const SIZE: Record<NonNullable<LogoProps['size']>, { box: string; img: string; text: string }> = {
  sm: { box: 'h-8',  img: 'h-7 w-7',   text: 'text-sm' },
  md: { box: 'h-10', img: 'h-9 w-9',   text: 'text-base' },
  lg: { box: 'h-14', img: 'h-12 w-12', text: 'text-lg' },
  xl: { box: 'h-20', img: 'h-16 w-16', text: 'text-2xl' },
};

/**
 * Site logo. Renders the brand mark in a polished rounded tile with a
 * subtle gradient background so it looks deliberate even on light or
 * dark headers — the raw PNG without any chrome looked muddy on most
 * surfaces.
 */
export default function Logo({
  className = '',
  href = '/',
  size = 'md',
  showWordmark = true,
}: LogoProps) {
  const s = SIZE[size];

  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`relative inline-flex ${s.box} aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 via-card to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border border-border shadow-sm overflow-hidden p-1.5`}
      >
        <Image
          src="/logo.png"
          alt="GroundOps Logo"
          width={64}
          height={64}
          className={`${s.img} object-contain`}
          priority
        />
      </span>
      {showWordmark && (
        <span className={`hidden sm:inline-block font-bold tracking-tight ${s.text} text-foreground leading-none`}>
          GroundOps
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center group">
        {inner}
      </Link>
    );
  }

  return inner;
}

