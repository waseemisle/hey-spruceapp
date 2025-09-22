import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8',
  authDomain: 'heyspruceappv2.firebaseapp.com',
  projectId: 'heyspruceappv2',
  storageBucket: 'heyspruceappv2.firebasestorage.app',
  messagingSenderId: '198738285054',
  appId: '1:198738285054:web:6878291b080771623a70af',
  measurementId: 'G-82NKE8271G'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testWorkflows() {
  console.log('🔄 COMPREHENSIVE WORKFLOW TESTING\n');
  
  const testResults = {
    workflows: {},
    errors: []
  };

  // Test 1: Complete Work Order to Invoice Workflow
  console.log('1️⃣ Testing Complete Work Order to Invoice Workflow...');
  try {
    // Step 1: Create a test work order
    console.log('   📝 Step 1: Creating test work order...');
    const workOrderData = {
      title: 'Comprehensive Test Work Order',
      description: 'Testing complete workflow from work order to invoice',
      priority: 'medium',
      category: 'maintenance',
      status: 'pending',
      clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
      clientName: 'Test Client',
      clientEmail: 'test@client.com',
      location: 'Test Location',
      createdBy: 'test-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const workOrderRef = await addDoc(collection(db, 'workorders'), workOrderData);
    console.log(`   ✅ Work order created: ${workOrderRef.id}`);
    
    // Step 2: Create a quote for the work order
    console.log('   📝 Step 2: Creating quote...');
    const quoteData = {
      workOrderId: workOrderRef.id,
      clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
      clientName: 'Test Client',
      clientEmail: 'test@client.com',
      title: 'Test Quote',
      description: 'Test quote for comprehensive testing',
      laborCost: 100,
      materialCost: 50,
      additionalCosts: 25,
      taxRate: 10,
      taxAmount: 17.5,
      totalAmount: 192.5,
      status: 'pending',
      createdBy: 'test-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const quoteRef = await addDoc(collection(db, 'quotes'), quoteData);
    console.log(`   ✅ Quote created: ${quoteRef.id}`);
    
    // Step 3: Accept the quote
    console.log('   📝 Step 3: Accepting quote...');
    const { updateDoc, doc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'quotes', quoteRef.id), {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log('   ✅ Quote accepted');
    
    // Step 4: Create invoice
    console.log('   📝 Step 4: Creating invoice...');
    const invoiceData = {
      workOrderId: workOrderRef.id,
      quoteId: quoteRef.id,
      clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
      clientName: 'Test Client',
      clientEmail: 'test@client.com',
      title: 'Test Invoice',
      description: 'Test invoice for comprehensive testing',
      laborCost: 100,
      materialCost: 50,
      additionalCosts: 25,
      taxRate: 10,
      taxAmount: 17.5,
      totalAmount: 192.5,
      status: 'draft',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'test-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);
    console.log(`   ✅ Invoice created: ${invoiceRef.id}`);
    
    testResults.workflows.workOrderToInvoice = {
      workOrderId: workOrderRef.id,
      quoteId: quoteRef.id,
      invoiceId: invoiceRef.id,
      status: 'success'
    };
    
    console.log('   🎉 Complete workflow successful!');
    
  } catch (error) {
    console.log(`   ❌ Work Order to Invoice workflow failed: ${error.message}`);
    testResults.errors.push(`Work Order to Invoice: ${error.message}`);
    testResults.workflows.workOrderToInvoice = { status: 'error', error: error.message };
  }

  // Test 2: Scheduled Invoice Workflow
  console.log('\n2️⃣ Testing Scheduled Invoice Workflow...');
  try {
    console.log('   📝 Creating scheduled invoice...');
    const scheduledInvoiceData = {
      clientId: 'l14Mfa3VghUCJjGajq9z7AC4I2T2',
      clientName: 'Test Client',
      clientEmail: 'test@client.com',
      title: 'Comprehensive Test Scheduled Invoice',
      description: 'Testing scheduled invoice workflow',
      amount: 300,
      frequency: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      time: '09:00',
      timezone: 'America/New_York',
      isActive: true,
      nextExecution: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdBy: 'test-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: 'Comprehensive test scheduled invoice'
    };
    
    const scheduledInvoiceRef = await addDoc(collection(db, 'scheduled_invoices'), scheduledInvoiceData);
    console.log(`   ✅ Scheduled invoice created: ${scheduledInvoiceRef.id}`);
    
    testResults.workflows.scheduledInvoice = {
      scheduledInvoiceId: scheduledInvoiceRef.id,
      status: 'success'
    };
    
    console.log('   🎉 Scheduled invoice workflow successful!');
    
  } catch (error) {
    console.log(`   ❌ Scheduled invoice workflow failed: ${error.message}`);
    testResults.errors.push(`Scheduled Invoice: ${error.message}`);
    testResults.workflows.scheduledInvoice = { status: 'error', error: error.message };
  }

  // Test 3: Client Registration Workflow
  console.log('\n3️⃣ Testing Client Registration Workflow...');
  try {
    console.log('   📝 Creating client registration...');
    const clientRegistrationData = {
      companyName: 'Comprehensive Test Company',
      contactPerson: 'Test Person',
      email: 'comprehensive@test.com',
      phone: '1234567890',
      businessType: 'Corporate Office',
      address: '123 Test Street',
      numberOfProperties: 5,
      preferredServices: ['HVAC Maintenance', 'General Maintenance'],
      additionalInfo: 'Comprehensive test registration',
      status: 'pending',
      submittedAt: new Date().toISOString(),
      password: 'testpassword123'
    };
    
    const clientRegistrationRef = await addDoc(collection(db, 'client_registrations'), clientRegistrationData);
    console.log(`   ✅ Client registration created: ${clientRegistrationRef.id}`);
    
    testResults.workflows.clientRegistration = {
      registrationId: clientRegistrationRef.id,
      status: 'success'
    };
    
    console.log('   🎉 Client registration workflow successful!');
    
  } catch (error) {
    console.log(`   ❌ Client registration workflow failed: ${error.message}`);
    testResults.errors.push(`Client Registration: ${error.message}`);
    testResults.workflows.clientRegistration = { status: 'error', error: error.message };
  }

  // Test 4: Subcontractor Registration Workflow
  console.log('\n4️⃣ Testing Subcontractor Registration Workflow...');
  try {
    console.log('   📝 Creating subcontractor registration...');
    const subcontractorData = {
      fullName: 'Test Subcontractor',
      email: 'subcontractor@test.com',
      phone: '0987654321',
      title: 'HVAC Technician',
      skills: ['HVAC Maintenance', 'Repair'],
      experience: '5 years',
      hourlyRate: '50',
      password: 'testpassword123',
      confirmPassword: 'testpassword123',
      address: {
        street: '456 Subcontractor Ave',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'Test Country'
      },
      businessInfo: {
        businessName: 'Test Subcontractor LLC',
        licenseNumber: 'TEST123',
        insuranceInfo: 'Test Insurance'
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const subcontractorRef = await addDoc(collection(db, 'subcontractors'), subcontractorData);
    console.log(`   ✅ Subcontractor registration created: ${subcontractorRef.id}`);
    
    testResults.workflows.subcontractorRegistration = {
      subcontractorId: subcontractorRef.id,
      status: 'success'
    };
    
    console.log('   🎉 Subcontractor registration workflow successful!');
    
  } catch (error) {
    console.log(`   ❌ Subcontractor registration workflow failed: ${error.message}`);
    testResults.errors.push(`Subcontractor Registration: ${error.message}`);
    testResults.workflows.subcontractorRegistration = { status: 'error', error: error.message };
  }

  // Summary
  console.log('\n📊 WORKFLOW TEST SUMMARY:');
  const successfulWorkflows = Object.values(testResults.workflows).filter(w => w.status === 'success').length;
  const totalWorkflows = Object.keys(testResults.workflows).length;
  
  console.log(`   ✅ Successful Workflows: ${successfulWorkflows}/${totalWorkflows}`);
  console.log(`   📊 Success Rate: ${((successfulWorkflows / totalWorkflows) * 100).toFixed(1)}%`);
  
  console.log('\n📊 Workflow Details:');
  Object.entries(testResults.workflows).forEach(([name, data]) => {
    console.log(`   ${name}: ${data.status === 'success' ? '✅' : '❌'} ${data.status}`);
    if (data.workOrderId) console.log(`      Work Order: ${data.workOrderId}`);
    if (data.quoteId) console.log(`      Quote: ${data.quoteId}`);
    if (data.invoiceId) console.log(`      Invoice: ${data.invoiceId}`);
    if (data.scheduledInvoiceId) console.log(`      Scheduled Invoice: ${data.scheduledInvoiceId}`);
    if (data.registrationId) console.log(`      Registration: ${data.registrationId}`);
    if (data.subcontractorId) console.log(`      Subcontractor: ${data.subcontractorId}`);
  });
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n🎉 ALL WORKFLOW TESTS PASSED!');
  }

  return testResults;
}

testWorkflows();
