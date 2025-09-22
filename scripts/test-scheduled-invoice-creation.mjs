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

async function testScheduledInvoiceCreation() {
  try {
    console.log('🧪 Testing Scheduled Invoice Creation...\n');
    
    // 1. Get a test client
    console.log('1. Getting test client...');
    const clientsSnapshot = await getDocs(collection(db, 'client_registrations'));
    const approvedClient = clientsSnapshot.docs.find(doc => {
      const data = doc.data();
      return data.status === 'approved' && data.userId;
    });
    
    if (!approvedClient) {
      console.error('❌ No approved client found');
      return;
    }
    
    const clientData = approvedClient.data();
    console.log(`✅ Found client: ${clientData.contactPerson} (${clientData.email})`);
    console.log(`   User ID: ${clientData.userId}\n`);
    
    // 2. Test the API call
    console.log('2. Testing scheduled invoice creation API...');
    const response = await fetch('http://localhost:3000/api/admin/scheduled-invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: clientData.userId,
        title: 'Test Monthly Invoice',
        description: 'Automated test scheduled invoice',
        amount: '150.00',
        frequency: 'monthly',
        dayOfMonth: '1',
        time: '09:00',
        timezone: 'America/New_York',
        notes: 'Test invoice created during testing',
        adminId: 'test-admin-id',
        adminName: 'Test Admin',
        adminEmail: 'test@admin.com'
      })
    });
    
    const result = await response.json();
    console.log(`📊 API Response Status: ${response.status}`);
    console.log(`📊 API Response:`, JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ Scheduled invoice created successfully!');
      console.log(`   Scheduled Invoice ID: ${result.scheduledInvoiceId}`);
      console.log(`   Next Execution: ${result.nextExecution}`);
    } else {
      console.log('❌ Scheduled invoice creation failed');
      console.log(`   Error: ${result.error}`);
      if (result.details) {
        console.log(`   Details: ${result.details}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Wait a moment for dev server to start, then run test
setTimeout(() => {
  testScheduledInvoiceCreation();
}, 3000);
