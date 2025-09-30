import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS, addDocument, getDocuments } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { WorkOrder } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await getDocuments(COLLECTIONS.WORK_ORDERS)
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch work orders' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Error fetching work orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch work orders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log('📝 Work Order Creation Request:', {
      title: data.title,
      clientId: data.clientId,
      categoryId: data.categoryId,
      locationId: data.locationId
    })

    // Validate required fields
    if (!data.title || !data.description || !data.clientId || !data.categoryId || !data.estimatedCost || !data.estimatedDateOfService) {
      console.log('❌ Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields: title, description, clientId, categoryId, estimatedCost, estimatedDateOfService' },
        { status: 400 }
      )
    }
    
    // Set createdBy if not provided
    if (!data.createdBy) {
      data.createdBy = 'admin'
    }

    // Get client and category names
    console.log(`🔍 Looking for client: ${data.clientId}`)
    const clientDoc = await getDoc(doc(db, COLLECTIONS.CLIENTS, data.clientId))
    console.log(`🔍 Looking for category: ${data.categoryId}`)
    const categoryDoc = await getDoc(doc(db, COLLECTIONS.CATEGORIES, data.categoryId))
    
    if (!clientDoc.exists() || !categoryDoc.exists()) {
      console.log('❌ Document check failed:')
      console.log(`   Client exists: ${clientDoc.exists()}`)
      console.log(`   Category exists: ${categoryDoc.exists()}`)
      return NextResponse.json(
        { 
          error: 'Client or category not found',
          details: {
            clientExists: clientDoc.exists(),
            categoryExists: categoryDoc.exists(),
            clientId: data.clientId,
            categoryId: data.categoryId
          }
        },
        { status: 404 }
      )
    }
    
    console.log('✅ Found client and category')

    const clientData = clientDoc.data()
    const categoryData = categoryDoc.data()
    
    if (!clientData || !categoryData) {
      return NextResponse.json(
        { error: 'Client or category data not found' },
        { status: 404 }
      )
    }

    // Get location data if locationId is provided
    let locationData = null
    if (data.locationId) {
      const locationDoc = await getDoc(doc(db, COLLECTIONS.LOCATIONS, data.locationId))
      if (locationDoc.exists()) {
        locationData = locationDoc.data()
      }
    }

    const workOrderData: Omit<WorkOrder, 'id'> = {
      title: data.title,
      description: data.description,
      priority: data.priority || 'medium',
      status: 'pending',
      categoryId: data.categoryId,
      categoryName: categoryData.name,
      location: locationData ? {
        id: data.locationId,
        name: locationData.name,
        address: `${locationData.address?.street || ''}, ${locationData.address?.city || ''}, ${locationData.address?.state || ''} ${locationData.address?.zipCode || ''}`.trim()
      } : {
        id: data.locationId || '',
        name: data.locationName || 'No location specified',
        address: data.locationAddress || ''
      },
      clientId: data.clientId,
      clientName: clientData.companyName || clientData.fullName,
      clientEmail: clientData.email,
      estimatedCost: parseFloat(data.estimatedCost),
      estimatedDateOfService: data.estimatedDateOfService,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: data.notes || ''
    }

    const { id, error: createError } = await addDocument(COLLECTIONS.WORK_ORDERS, workOrderData)

    if (createError) {
      throw new Error(createError)
    }

    return NextResponse.json({
      success: true,
      workOrderId: id,
      message: 'Work order created successfully'
    })

  } catch (error: any) {
    console.error('Error creating work order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create work order' },
      { status: 500 }
    )
  }
}