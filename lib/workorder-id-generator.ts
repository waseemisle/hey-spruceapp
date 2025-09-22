import { db } from '@/lib/firebase'
import { collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc, where } from 'firebase/firestore'

interface WorkOrderCounter {
  id: string
  lastWorkOrderNumber: number
  updatedAt: string
}

/**
 * Generates the next sequential work order ID starting from WO0001
 * Uses a counter document in Firestore to ensure sequential numbering
 */
export async function generateWorkOrderId(): Promise<string> {
  const workOrdersRef = collection(db, 'workorders')
  
  try {
    const counterRef = doc(db, 'counters', 'workorders')
    
    // Get the current counter value
    const counterQuery = query(
      collection(db, 'counters'),
      where('type', '==', 'workorders')
    )
    
    const counterSnapshot = await getDocs(counterQuery)
    
    let nextNumber = 1
    
    if (counterSnapshot.empty) {
      // First work order - create counter document
      await addDoc(collection(db, 'counters'), {
        type: 'workorders',
        lastWorkOrderNumber: 0,
        updatedAt: new Date().toISOString()
      })
    } else {
      // Get the last work order number and increment
      const counterData = counterSnapshot.docs[0].data() as WorkOrderCounter
      nextNumber = counterData.lastWorkOrderNumber + 1
      
      // Update the counter
      await updateDoc(counterSnapshot.docs[0].ref, {
        lastWorkOrderNumber: nextNumber,
        updatedAt: new Date().toISOString()
      })
    }
    
    // Format the work order ID as WO0001, WO0002, etc.
    const workOrderId = `WO${nextNumber.toString().padStart(4, '0')}`
    
    console.log(`Generated work order ID: ${workOrderId}`)
    return workOrderId
    
  } catch (error) {
    console.error('Error generating work order ID:', error)
    
    // Fallback: try to get the highest existing work order number
    try {
      const workOrdersQuery = query(
        workOrdersRef,
        orderBy('workOrderId', 'desc'),
        limit(1)
      )
      
      const snapshot = await getDocs(workOrdersQuery)
      
      if (snapshot.empty) {
        return 'WO0001'
      }
      
      const lastWorkOrder = snapshot.docs[0].data()
      const lastId = lastWorkOrder.workOrderId || 'WO0000'
      const lastNumber = parseInt(lastId.replace('WO', '')) || 0
      const nextNumber = lastNumber + 1
      
      return `WO${nextNumber.toString().padStart(4, '0')}`
      
    } catch (fallbackError) {
      console.error('Fallback work order ID generation failed:', fallbackError)
      // Ultimate fallback - use timestamp
      const timestamp = Date.now().toString().slice(-4)
      return `WO${timestamp}`
    }
  }
}

/**
 * Alternative approach using a simpler counter system
 */
export async function generateWorkOrderIdSimple(): Promise<string> {
  try {
    // Get all work orders to find the highest number
    const workOrdersQuery = query(
      collection(db, 'workorders'),
      orderBy('createdAt', 'desc')
    )
    
    const snapshot = await getDocs(workOrdersQuery)
    
    let nextNumber = 1
    
    if (!snapshot.empty) {
      // Find the highest work order number
      let highestNumber = 0
      
      for (const doc of snapshot.docs) {
        const data = doc.data()
        if (data.workOrderId && data.workOrderId.startsWith('WO')) {
          const number = parseInt(data.workOrderId.replace('WO', ''))
          if (!isNaN(number) && number > highestNumber) {
            highestNumber = number
          }
        }
      }
      
      nextNumber = highestNumber + 1
    }
    
    const workOrderId = `WO${nextNumber.toString().padStart(4, '0')}`
    console.log(`Generated work order ID: ${workOrderId}`)
    return workOrderId
    
  } catch (error) {
    console.error('Error generating work order ID:', error)
    // Fallback to timestamp-based ID
    const timestamp = Date.now().toString().slice(-4)
    return `WO${timestamp}`
  }
}
