'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import Unauthorized from '@/components/ui/unauthorized'
import Loader from '@/components/ui/loader'

interface WithRoleProtectionProps {
  allowedRoles: string[]
  children: React.ReactNode
  fallbackMessage?: string
}

export default function WithRoleProtection({ 
  allowedRoles, 
  children, 
  fallbackMessage 
}: WithRoleProtectionProps) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    if (loading) {
      setIsAuthorized(null)
      return
    }

    if (!user || !profile) {
      router.push('/portal-login')
      return
    }

    if (!allowedRoles.includes(profile.role)) {
      setIsAuthorized(false)
      return
    }

    setIsAuthorized(true)
  }, [user, profile, loading, allowedRoles, router])

  // Show loading while checking authentication
  if (loading || isAuthorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    )
  }

  // Show unauthorized page if user doesn't have required role
  if (!isAuthorized) {
    return (
      <Unauthorized 
        message={fallbackMessage || `This page is only accessible to: ${allowedRoles.join(', ')}`}
      />
    )
  }

  // Show protected content if user has required role
  return <>{children}</>
}
