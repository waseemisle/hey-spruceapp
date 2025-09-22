import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function testWorkOrderFunctionality() {
  try {
    console.log('🧪 Testing Work Order Functionality...\n');
    
    // 1. Test work orders API
    console.log('1. Testing work orders API...');
    const workOrdersResponse = await fetch('http://localhost:3000/api/workorders?userId=test&role=admin');
    const workOrdersResult = await workOrdersResponse.json();
    
    console.log(`📊 Work Orders API Status: ${workOrdersResponse.status}`);
    if (workOrdersResult.success) {
      console.log(`✅ Found ${workOrdersResult.workOrders.length} work orders`);
    } else {
      console.log(`❌ Work orders API failed: ${workOrdersResult.error}`);
    }
    
    // 2. Test subcontractors API
    console.log('\n2. Testing subcontractors API...');
    const subcontractorsResponse = await fetch('http://localhost:3000/api/admin/subcontractors');
    const subcontractorsResult = await subcontractorsResponse.json();
    
    console.log(`📊 Subcontractors API Status: ${subcontractorsResponse.status}`);
    if (subcontractorsResult.success) {
      console.log(`✅ Found ${subcontractorsResult.subcontractors.length} subcontractors`);
    } else {
      console.log(`❌ Subcontractors API failed: ${subcontractorsResult.error}`);
    }
    
    // 3. Test client registrations API
    console.log('\n3. Testing client registrations API...');
    const clientsResponse = await fetch('http://localhost:3000/api/admin/list-registrations');
    const clientsResult = await clientsResponse.json();
    
    console.log(`📊 Client Registrations API Status: ${clientsResponse.status}`);
    if (clientsResult.success) {
      console.log(`✅ Found ${clientsResult.registrations.length} client registrations`);
    } else {
      console.log(`❌ Client registrations API failed: ${clientsResult.error}`);
    }
    
    // 4. Test quotes API
    console.log('\n4. Testing quotes API...');
    const quotesResponse = await fetch('http://localhost:3000/api/admin/quotes');
    const quotesResult = await quotesResponse.json();
    
    console.log(`📊 Quotes API Status: ${quotesResponse.status}`);
    if (quotesResult.success) {
      console.log(`✅ Found ${quotesResult.quotes.length} quotes`);
    } else {
      console.log(`❌ Quotes API failed: ${quotesResult.error}`);
    }
    
    // 5. Test invoices API
    console.log('\n5. Testing invoices API...');
    const invoicesResponse = await fetch('http://localhost:3000/api/admin/invoices');
    const invoicesResult = await invoicesResponse.json();
    
    console.log(`📊 Invoices API Status: ${invoicesResponse.status}`);
    if (invoicesResult.success) {
      console.log(`✅ Found ${invoicesResult.invoices.length} invoices`);
    } else {
      console.log(`❌ Invoices API failed: ${invoicesResult.error}`);
    }
    
    console.log('\n🎉 Work Order Functionality Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

testWorkOrderFunctionality();
