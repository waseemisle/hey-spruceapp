// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Subcontractor marks work order as completed
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== SUBCONTRACTOR WORK COMPLETION API START ===')
    
    const workOrderId = params.id
    const data = await request.json()
    const { subcontractorId, completionNotes, actualDuration, actualCost } = data

    console.log('Subcontractor completing work order:', workOrderId)

    // Validate required fields
    if (!subcontractorId) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get current work order
    const workOrderRef = doc(db, 'workorders', workOrderId)
    const workOrderDoc = await getDoc(workOrderRef)
    
    if (!workOrderDoc.exists()) {
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const currentWorkOrder = workOrderDoc.data()
    console.log('Current work order:', currentWorkOrder)

    // Validate subcontractor assignment
    if (currentWorkOrder.assignedTo !== subcontractorId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Work order not assigned to this subcontractor' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate work order status
    if (currentWorkOrder.status !== 'in-progress') {
      return new Response(
        JSON.stringify({ error: 'Only in-progress work orders can be completed' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare update data
    const updateData: any = {
      status: 'completed',
      completedDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    if (completionNotes) {
      updateData.completionNotes = completionNotes
    }
    if (actualDuration) {
      updateData.actualDuration = actualDuration
    }
    if (actualCost) {
      updateData.actualCost = actualCost
    }

    // Update work order
    await updateDoc(workOrderRef, updateData)
    console.log('Work order completed successfully')

    // Update workflow status
    await updateWorkflowStatus(workOrderId, 'work_completed', subcontractorId, 
      `Work completed by subcontractor. Notes: ${completionNotes || 'No notes provided'}`)

    console.log('=== SUBCONTRACTOR WORK COMPLETION API SUCCESS ===')

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Work order marked as completed successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== SUBCONTRACTOR WORK COMPLETION API ERROR ===')
    console.error('Error completing work order:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      workOrderId: params.id
    })
    console.error('=== END ERROR LOG ===')
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to complete work order',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

// Helper function to update workflow status
async function updateWorkflowStatus(workOrderId: string, step: string, updatedBy: string, notes?: string) {
  try {
    const { collection, addDoc } = await import('firebase/firestore')
    const workflowRef = collection(db, 'workflow_status')
    const workflowData = {
      workOrderId,
      currentStep: step,
      status: step.includes('completed') ? 'completed' : 'in_progress',
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: updatedBy,
      notes
    }
    
    await addDoc(workflowRef, workflowData)
    console.log('Workflow status updated:', workflowData)
  } catch (error) {
    console.error('Error updating workflow status:', error)
  }
}

