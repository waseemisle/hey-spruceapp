'use client'

import { useContext } from 'react'
import { createContext } from 'react'

// Create context for active section
const ActiveSectionContext = createContext<{
  activeSection: string
  setActiveSection: (section: string) => void
}>({
  activeSection: 'dashboard',
  setActiveSection: () => {}
})

export const useActiveSection = () => useContext(ActiveSectionContext)
export { ActiveSectionContext }
