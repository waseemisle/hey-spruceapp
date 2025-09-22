import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, addDoc } from 'firebase/firestore';

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
    console.log('Testing scheduled invoice creation...');
    
    // Get a client ID from the database
    const clientsSnapshot = await getDocs(collection(db, 'client_registrations'));
    const approvedClient = clientsSnapshot.docs.find(doc => {
      const data = doc.data();
      return data.status === 'approved' && data.userId;
    });
    
    if (!approvedClient) {
      console.error('No approved client found');
      return;
    }
    
    const clientData = approvedClient.data();
    console.log('Using client:', clientData.contactPerson, '(', clientData.email, ')');
    console.log('Client userId:', clientData.userId);
    
    // Test the API call
    const response = await fetch('http://localhost:3000/api/admin/scheduled-invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: clientData.userId,
        title: 'Test Monthly Invoice',
        description: 'Test scheduled invoice',
        amount: '100.00',
        frequency: 'monthly',
        dayOfMonth: '1',
        time: '09:00',
        timezone: 'America/New_York',
        notes: 'Test invoice',
        adminId: 'test-admin-id'
      })
    });
    
    const result = await response.json();
    console.log('API Response:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testScheduledInvoiceCreation();
