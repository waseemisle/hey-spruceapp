import firebase from 'firebase/compat/app'
import 'firebase/compat/auth'
import 'firebase/compat/firestore'

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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig)
}
export const auth = firebase.auth()
export const db = firebase.firestore()

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
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password)
    return { user: userCredential.user, error: null }
  } catch (error: any) {
    return { user: null, error: error.message }
  }
}

export async function createUserWithFirebase(email: string, password: string) {
  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password)
    return { user: userCredential.user, error: null }
  } catch (error: any) {
    return { user: null, error: error.message }
  }
}

export async function signOutFirebase() {
  try {
    await firebase.auth().signOut()
    return { error: null }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function getCurrentUser(): Promise<firebase.User | null> {
  return new Promise((resolve) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const docRef = db.collection('users').doc(userId)
    const docSnap = await docRef.get()
    
    if (docSnap.exists) {
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
    
    await db.collection('users').doc(user.id).set(userData)
    return { data: userData, error: null }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

// Portal access helpers
export function canAccessPortal(userRole: string, portalType: string): boolean {
  const portalRoleMap: Record<string, string[]> = {
    'client': ['client'],
    'admin': ['admin'],
    'subcontractor': ['subcontractor']
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

// Collection names
export const COLLECTIONS = {
  USERS: 'users',
  CLIENTS: 'clients',
  SUBCONTRACTORS: 'subcontractors',
  ADMIN_USERS: 'adminUsers',
  LOCATIONS: 'locations',
  CATEGORIES: 'categories',
  WORK_ORDERS: 'workOrders',
  QUOTES: 'quotes',
  INVOICES: 'invoices',
  BIDDING_WORK_ORDERS: 'biddingWorkOrders',
  ASSIGNED_WORK_ORDERS: 'assignedWorkOrders',
  SCHEDULED_INVOICES: 'scheduledInvoices',
  WORKFLOW_STATUS: 'workflowStatus'
} as const

// Utility functions for Firebase operations
export async function addDocument(collectionName: string, data: any) {
  try {
    const docRef = await db.collection(collectionName).add({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    return { id: docRef.id, error: null }
  } catch (error: any) {
    return { id: null, error: error.message }
  }
}

export async function updateDocument(collectionName: string, docId: string, data: any) {
  try {
    await db.collection(collectionName).doc(docId).update({
      ...data,
      updatedAt: new Date().toISOString()
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getDocument(collectionName: string, docId: string) {
  try {
    const docRef = db.collection(collectionName).doc(docId)
    const docSnap = await docRef.get()
    
    if (docSnap.exists) {
      return { data: { id: docSnap.id, ...docSnap.data() }, error: null }
    } else {
      return { data: null, error: 'Document not found' }
    }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

export async function getDocuments(collectionName: string, constraints?: any[]) {
  try {
    let q: any = db.collection(collectionName)
    
    if (constraints && constraints.length > 0) {
      // Apply constraints for compat API
      constraints.forEach(constraint => {
        if (constraint.type === 'where') {
          q = q.where(constraint.field, constraint.operator, constraint.value)
        } else if (constraint.type === 'orderBy') {
          q = q.orderBy(constraint.field, constraint.direction)
        } else if (constraint.type === 'limit') {
          q = q.limit(constraint.value)
        }
      })
    }
    
    const querySnapshot = await q.get()
    const documents = querySnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }))
    
    return { data: documents, error: null }
  } catch (error: any) {
    return { data: [], error: error.message }
  }
}

export async function deleteDocument(collectionName: string, docId: string) {
  try {
    await db.collection(collectionName).doc(docId).delete()
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
