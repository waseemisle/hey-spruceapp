'use client'

import { useEffect, useState } from 'react'
import firebase from 'firebase/compat/app'
import { 
  auth, 
  signInWithFirebase, 
  signOutFirebase, 
  getUserProfile, 
  createUserProfile,
  UserProfile,
  canAccessPortal,
  getRedirectUrl
} from './firebase'

export interface AuthState {
  user: firebase.User | null
  profile: UserProfile | null
  loading: boolean
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
    // Get initial auth state
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // User is signed in
        let profile = await getUserProfile(user.uid)
        
        if (!profile) {
          // Create profile if it doesn't exist
          const { data: newProfile, error } = await createUserProfile({
            id: user.uid,
            email: user.email || '',
            fullName: user.displayName || user.email?.split('@')[0] || 'User',
            role: 'client' // Default role
          })
          
          if (error) {
            console.error('Error creating profile:', error)
          } else {
            profile = newProfile
          }
        }
        
        setAuthState({
          user,
          profile,
          loading: false,
        })
      } else {
        // User is signed out
        setAuthState({
          user: null,
          profile: null,
          loading: false,
        })
      }
    })

    return () => unsubscribe()
  }, [])

  const signIn = async (email: string, password: string, portalType: string) => {
    setAuthState(prev => ({ ...prev, loading: true }))
    
    // For client portal, check registration status first
    if (portalType === 'client') {
      try {
        const response = await fetch('/api/check-registration-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        })

        if (response.ok) {
          const data = await response.json()
          
          if (data.status === 'not_found') {
            setAuthState(prev => ({ ...prev, loading: false }))
            throw new Error('No registration found for this email. Please register first.')
          }
          
          if (data.status === 'pending') {
            setAuthState(prev => ({ ...prev, loading: false }))
            throw new Error('Approval Pending')
          }
          
          if (data.status === 'rejected') {
            setAuthState(prev => ({ ...prev, loading: false }))
            throw new Error('Your registration has been rejected. Please contact support for more information.')
          }
          
          // If approved, continue with authentication
        }
      } catch (error: any) {
        // If it's our custom error message, throw it
        if (error.message === 'Approval Pending' || error.message.includes('registration')) {
          throw error
        }
        // Otherwise, continue with authentication attempt
      }
    }
    
    const { user, error } = await signInWithFirebase(email, password)
    
    if (error) {
      setAuthState(prev => ({ ...prev, loading: false }))
      throw new Error(error)
    }

    if (!user) {
      setAuthState(prev => ({ ...prev, loading: false }))
      throw new Error('Authentication failed')
    }

    // Get or create user profile
    let profile = await getUserProfile(user.uid)
    
    if (!profile) {
      // Create profile with the selected portal type as role
      const { data: newProfile, error: createError } = await createUserProfile({
        id: user.uid,
        email: email,
        fullName: email.split('@')[0],
        role: portalType === 'admin' ? 'admin' : portalType as 'client' | 'subcontractor'
      })
      
      if (createError) {
        setAuthState(prev => ({ ...prev, loading: false }))
        throw new Error(createError)
      }
      
      profile = newProfile
    }

    // Verify portal access
    if (!profile || !canAccessPortal(profile.role, portalType)) {
      await signOut()
      throw new Error(`Your account does not have access to the ${portalType} portal.`)
    }

    setAuthState({
      user,
      profile,
      loading: false,
    })

    return { user, profile }
  }

  const signOut = async () => {
    const { error } = await signOutFirebase()
    if (error) throw new Error(error)
    
    setAuthState({
      user: null,
      profile: null,
      loading: false,
    })
  }

  const resetPassword = async (email: string) => {
    // Firebase doesn't have a direct resetPassword function in the web SDK
    // This would typically be handled by sending an email through Firebase Auth
    throw new Error('Password reset functionality will be implemented with Firebase Auth email templates')
  }

  return {
    ...authState,
    signIn,
    signOut,
    resetPassword,
  }
}

export function usePortalAccess(portalType: string) {
  const { user, profile, loading } = useAuth()
  
  const hasAccess = profile ? canAccessPortal(profile.role, portalType) : false
  const redirectUrl = getRedirectUrl(portalType)

  return {
    hasAccess,
    redirectUrl,
    user,
    profile,
    loading,
  }
}