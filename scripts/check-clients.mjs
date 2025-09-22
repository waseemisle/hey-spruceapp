import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ',
  authDomain: 'heyspruceappv2.firebaseapp.com',
  projectId: 'heyspruceappv2',
  storageBucket: 'heyspruceappv2.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef123456789'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkClients() {
  try {
    console.log('Checking client_registrations collection...');
    const clientsSnapshot = await getDocs(collection(db, 'client_registrations'));
    console.log('Total clients found:', clientsSnapshot.docs.length);
    
    clientsSnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Client ${index + 1}:`);
      console.log('  - Doc ID:', doc.id);
      console.log('  - User ID:', data.userId);
      console.log('  - Email:', data.email);
      console.log('  - Contact Person:', data.contactPerson);
      console.log('  - Status:', data.status);
      console.log('  - Created At:', data.createdAt);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

checkClients();
