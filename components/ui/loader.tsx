'use client'

import { cn } from '@/lib/utils'

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  className?: string
  fullScreen?: boolean
}

export default function Loader({ 
  size = 'md', 
  text = 'Loading...', 
  className = '',
  fullScreen = false
}: LoaderProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  }

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }

  const LoaderContent = () => (
    <div className={cn(
      "flex flex-col items-center justify-center gap-4",
      fullScreen && "min-h-screen bg-gray-50",
      className
    )}>
      {/* Simple Spinner Loader */}
      <div className={cn(
        "animate-spin rounded-full border-4 border-gray-200 border-t-primary",
        sizeClasses[size]
      )}></div>
      
      {/* Loading Text */}
      <div className="text-center">
        <p className={cn(
          "font-medium text-gray-700",
          textSizeClasses[size]
        )}>
          {text}
        </p>
        {/* Animated dots */}
        <div className="flex justify-center gap-1 mt-2">
          <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  )

  return <LoaderContent />
}

// Full screen loader overlay
export function FullScreenLoader({ text = 'Loading...', className = '' }: { text?: string, className?: string }) {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-90 backdrop-blur-sm z-50 flex items-center justify-center">
      <Loader size="xl" text={text} className={className} />
    </div>
  )
}

// Inline loader for buttons/forms
export function InlineLoader({ text = 'Loading...', className = '' }: { text?: string, className?: string }) {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader size="md" text={text} className={className} />
    </div>
  )
}
