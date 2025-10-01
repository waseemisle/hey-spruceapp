// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Subcontractor, SubcontractorRegistrationData } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const registrationData = data as SubcontractorRegistrationData

    console.log('Received subcontractor registration:', registrationData)

    // Validate required fields
    const requiredFields = [
      'fullName', 'email', 'phone', 'title', 'categoryId', 'skills', 'experience', 'password',
      'address.street', 'address.city', 'address.state', 'address.zipCode'
    ]

    const missingFields = requiredFields.filter(field => {
      if (field.includes('.')) {
        const [parent, child] = field.split('.')
        const parentValue = registrationData[parent as keyof SubcontractorRegistrationData] as any
        return !parentValue?.[child]
      }
      return !registrationData[field as keyof SubcontractorRegistrationData]
    })

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missingFields.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate password
    if (registrationData.password !== registrationData.confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Passwords do not match' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (registrationData.password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters long' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if email is already registered
    const emailQuery = 
      db.collection('subcontractors')
      .where('email', '==', registrationData.email)
    
    const emailDocs = await emailQuery.get()
    if (!emailDocs.empty) {
      return new Response(
        JSON.stringify({ error: 'Email is already registered as a subcontractor' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create Firebase Auth user
    let firebaseUser
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        registrationData.email,
        registrationData.password
      )
      firebaseUser = userCredential.user
      console.log('Firebase user created:', firebaseUser.uid)
    } catch (error: any) {
      console.error('Error creating Firebase user:', error)
      if (error.code === 'auth/email-already-in-use') {
        return new Response(
        JSON.stringify({ error: 'Email is already in use. Please use a different email or try logging in.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
      }
      return new Response(
        JSON.stringify({ error: 'Failed to create user account. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get category name
    const categoriesRef = db.collection('categories')
    const categoryQuery = categoriesRef.where('__name__', '==', registrationData.categoryId)
    const categorySnapshot = await categoryQuery.get()
    
    let categoryName = 'Unknown Category'
    if (!categorySnapshot.empty) {
      const categoryData = categorySnapshot.docs[0].data()
      if (categoryData) {
        categoryName = categoryData.name || 'Unknown Category'
      }
    }

    // Create subcontractor document
    const subcontractorData: Omit<Subcontractor, 'id'> = {
      userId: firebaseUser.uid,
      fullName: registrationData.fullName,
      email: registrationData.email,
      phone: registrationData.phone,
      title: registrationData.title,
      categoryId: registrationData.categoryId,
      categoryName: categoryName,
      skills: registrationData.skills,
      experience: registrationData.experience,
      hourlyRate: registrationData.hourlyRate ? parseFloat(registrationData.hourlyRate) : undefined,
      availability: 'available',
      status: 'pending',
      address: registrationData.address,
      businessInfo: registrationData.businessInfo,
      references: registrationData.references?.filter(ref => 
        ref.name && ref.contact && ref.relationship
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Clean undefined values
    const cleanSubcontractorData = Object.fromEntries(
      Object.entries(subcontractorData).filter(([_, value]) => value !== undefined)
    )

    const docRef = await db.collection('subcontractors').add(cleanSubcontractorData)

    console.log('Subcontractor registered successfully:', docRef.id)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Subcontractor registration submitted successfully',
      subcontractorId: docRef.id
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error registering subcontractor:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to register subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

