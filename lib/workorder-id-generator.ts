import { db } from '@/lib/firebase'

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
  try {
    // Get the current counter value
    const counterQuery = db.collection('counters').where('type', '==', 'workorders')
    const counterSnapshot = await counterQuery.get()
    
    let nextNumber = 1
    
    if (counterSnapshot.empty) {
      // First work order - create counter document
      await db.collection('counters').add({
        type: 'workorders',
        lastWorkOrderNumber: 0,
        updatedAt: new Date().toISOString()
      })
    } else {
      // Get the last work order number and increment
      const counterData = counterSnapshot.docs[0].data() as WorkOrderCounter
      nextNumber = counterData.lastWorkOrderNumber + 1
      
      // Update the counter
      await counterSnapshot.docs[0].ref.update({
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
      const workOrdersQuery = db.collection('workorders')
        .orderBy('workOrderId', 'desc')
        .limit(1)
      
      const snapshot = await workOrdersQuery.get()
      
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
    const workOrdersQuery = db.collection('workorders').orderBy('createdAt', 'desc')
    const snapshot = await workOrdersQuery.get()
    
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
