import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  href?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-8 w-auto',
  md: 'h-12 w-auto',
  lg: 'h-16 w-auto',
  xl: 'h-20 w-auto'
};

export default function Logo({ className = '', href = '/', size = 'md' }: LogoProps) {
  const logoElement = (
    <Image
      src="https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/681007b1b7f5a5cc527f1b94_Hey_SPRUCE_logo_font.png"
      alt="Hey Spruce Logo"
      width={200}
      height={60}
      className={`${sizeClasses[size]} ${className}`}
      priority
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {logoElement}
      </Link>
    );
  }

  return logoElement;
}

