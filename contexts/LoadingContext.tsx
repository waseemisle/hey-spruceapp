'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { FullScreenLoader } from '@/components/ui/loader'

interface LoadingContextType {
  isLoading: boolean
  loadingText: string
  setLoading: (loading: boolean, text?: string) => void
  showLoading: (text?: string) => void
  hideLoading: () => void
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined)

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Loading...')

  const setLoading = (loading: boolean, text: string = 'Loading...') => {
    setIsLoading(loading)
    setLoadingText(text)
  }

  const showLoading = (text: string = 'Loading...') => {
    setIsLoading(true)
    setLoadingText(text)
  }

  const hideLoading = () => {
    setIsLoading(false)
  }

  return (
    <LoadingContext.Provider value={{
      isLoading,
      loadingText,
      setLoading,
      showLoading,
      hideLoading
    }}>
      {children}
      {isLoading && <FullScreenLoader text={loadingText} />}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const context = useContext(LoadingContext)
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}
