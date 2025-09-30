// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { getDocs, collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { Category } from '@/lib/types'

export async function GET(request: Request) {
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

    return new Response(
        JSON.stringify(categories),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching categories:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch categories' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Validate required fields
    if (!data.name || !data.createdBy) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name and createdBy' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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

    return new Response(
        JSON.stringify({
      success: true,
      categoryId: docRef.id,
      message: 'Category created successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error creating category:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to create category' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json()
    
    if (!data.id) {
      return new Response(
        JSON.stringify({ error: 'Category ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const updateData = {
      ...data,
      updatedAt: new Date().toISOString()
    }

    // Remove id from update data
    delete updateData.id

    await updateDoc(doc(db, COLLECTIONS.CATEGORIES, data.id), updateData)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Category updated successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error updating category:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to update category' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('id')
    
    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: 'Category ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    await deleteDoc(doc(db, COLLECTIONS.CATEGORIES, categoryId))

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Category deleted successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error deleting category:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to delete category' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
