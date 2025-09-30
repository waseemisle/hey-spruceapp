import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { getDocs, collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { Category } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('activeOnly') === 'true'

    let q = collection(db, COLLECTIONS.CATEGORIES)
    
    if (activeOnly) {
      q = query(collection(db, COLLECTIONS.CATEGORIES), where('isActive', '==', true))
    }
    
    q = query(q, orderBy('name', 'asc'))
    
    const querySnapshot = await getDocs(q)
    const categories = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json(categories)

  } catch (error: any) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Validate required fields
    if (!data.name || !data.createdBy) {
      return NextResponse.json(
        { error: 'Missing required fields: name and createdBy' },
        { status: 400 }
      )
    }

    const categoryData: Omit<Category, 'id'> = {
      name: data.name,
      description: data.description || '',
      isActive: true,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const docRef = await addDoc(collection(db, COLLECTIONS.CATEGORIES), categoryData)

    return NextResponse.json({
      success: true,
      categoryId: docRef.id,
      message: 'Category created successfully'
    })

  } catch (error: any) {
    console.error('Error creating category:', error)
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    
    if (!data.id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    }

    const updateData = {
      ...data,
      updatedAt: new Date().toISOString()
    }

    // Remove id from update data
    delete updateData.id

    await updateDoc(doc(db, COLLECTIONS.CATEGORIES, data.id), updateData)

    return NextResponse.json({
      success: true,
      message: 'Category updated successfully'
    })

  } catch (error: any) {
    console.error('Error updating category:', error)
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('id')
    
    if (!categoryId) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    }

    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, categoryId))

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully'
    })

  } catch (error: any) {
    console.error('Error deleting category:', error)
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    )
  }
}
