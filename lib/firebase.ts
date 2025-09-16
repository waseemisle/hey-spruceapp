import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, collection } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8",
  authDomain: "heyspruceappv2.firebaseapp.com",
  projectId: "heyspruceappv2",
  storageBucket: "heyspruceappv2.firebasestorage.app",
  messagingSenderId: "198738285054",
  appId: "1:198738285054:web:6878291b080771623a70af",
  measurementId: "G-82NKE8271G"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

export interface UserProfile {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'client' | 'subcontractor'
  createdAt: string
  updatedAt: string
}

export interface WorkOrder {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  clientId: string
  subcontractorId?: string
  propertyId: string
  estimatedCost: number
  actualCost?: number
  createdAt: string
  updatedAt: string
  dueDate: string
}

export interface Property {
  id: string
  name: string
  address: string
  clientId: string
  propertyType: string
  createdAt: string
  updatedAt: string
}

export interface Proposal {
  id: string
  workOrderId: string
  subcontractorId: string
  amount: number
  description: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

// Auth helpers
export async function signInWithFirebase(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return { user: userCredential.user, error: null }
  } catch (error: any) {
    return { user: null, error: error.message }
  }
}

export async function signOutFirebase() {
  try {
    await signOut(auth)
    return { error: null }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(db, 'users', userId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as UserProfile
    } else {
      return null
    }
  } catch (error) {
    console.error('Error getting user profile:', error)
    return null
  }
}

export async function createUserProfile(user: {
  id: string
  email: string
  fullName: string
  role: 'admin' | 'client' | 'subcontractor'
}) {
  try {
    const userData = {
      ...user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    await setDoc(doc(db, 'users', user.id), userData)
    return { data: userData, error: null }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

// Portal access helpers
export function canAccessPortal(userRole: string, portalType: string): boolean {
  const portalRoleMap: Record<string, string[]> = {
    'client': ['client', 'admin'],
    'admin': ['admin'],
    'subcontractor': ['subcontractor', 'admin']
  }
  return portalRoleMap[portalType]?.includes(userRole) || false
}

export function getRedirectUrl(portalType: string): string {
  switch (portalType) {
    case 'client':
      return '/client-portal'
    case 'admin':
      return '/admin-portal'
    case 'subcontractor':
      return '/subcontractor-portal'
    default:
      return '/portal-login'
  }
}

// Demo users setup
export const demoUsers = [
  {
    email: 'demo.client@heyspruce.com',
    password: 'demo123',
    role: 'client',
    fullName: 'Demo Client'
  },
  {
    email: 'demo.admin@heyspruce.com',
    password: 'demo123',
    role: 'admin',
    fullName: 'Demo Admin'
  },
  {
    email: 'demo.sub@heyspruce.com',
    password: 'demo123',
    role: 'subcontractor',
    fullName: 'Demo Subcontractor'
  }
]
