'use client'

import Image from 'next/image'

interface LogoProps {
  className?: string
  showText?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
}

export default function Logo({ 
  className = '', 
  showText = true, 
  size = 'md' 
}: LogoProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    '2xl': 'h-20 w-20',
    '3xl': 'h-24 w-24'
  }

  const textSizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
    '2xl': 'text-4xl',
    '3xl': 'text-5xl'
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/681007b1b7f5a5cc527f1b94_Hey_SPRUCE_logo_font.png"
        alt="Spruce App Logo"
        width={size === 'sm' ? 24 : size === 'md' ? 40 : size === 'lg' ? 48 : size === 'xl' ? 64 : size === '2xl' ? 80 : 96}
        height={size === 'sm' ? 24 : size === 'md' ? 40 : size === 'lg' ? 48 : size === 'xl' ? 64 : size === '2xl' ? 80 : 96}
        className={`${sizeClasses[size]} object-contain`}
        priority
        unoptimized
      />
      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold text-gray-900 ${textSizeClasses[size]}`}>
            Spruce App
          </span>
          <span className="text-xs text-gray-600 hidden sm:block">
            Property Maintenance
          </span>
        </div>
      )}
    </div>
  )
}
