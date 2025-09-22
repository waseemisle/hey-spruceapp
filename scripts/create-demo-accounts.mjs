import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';

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
const auth = getAuth(app);
const db = getFirestore(app);

async function createDemoAccounts() {
  console.log('👥 CREATING DEMO ACCOUNTS\n');
  
  const demoAccounts = [
    {
      email: 'demo.client@heyspruce.com',
      password: 'demo123',
      role: 'client',
      profile: {
        fullName: 'Demo Client',
        email: 'demo.client@heyspruce.com',
        role: 'client',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      registration: {
        companyName: 'Demo Client Company',
        contactPerson: 'Demo Client',
        email: 'demo.client@heyspruce.com',
        phone: '555-0101',
        businessType: 'Corporate Office',
        address: '123 Demo Street, Demo City, DC 12345',
        numberOfProperties: 5,
        preferredServices: ['HVAC Maintenance', 'General Maintenance'],
        additionalInfo: 'Demo client for testing purposes',
        status: 'approved',
        submittedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        reviewedBy: 'demo.admin@heyspruce.com',
        reviewedAt: new Date().toISOString(),
        password: 'demo123'
      }
    },
    {
      email: 'demo.admin@heyspruce.com',
      password: 'demo123',
      role: 'admin',
      profile: {
        fullName: 'Demo Admin',
        email: 'demo.admin@heyspruce.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    },
    {
      email: 'demo.sub@heyspruce.com',
      password: 'demo123',
      role: 'subcontractor',
      profile: {
        fullName: 'Demo Subcontractor',
        email: 'demo.sub@heyspruce.com',
        role: 'subcontractor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      subcontractor: {
        fullName: 'Demo Subcontractor',
        email: 'demo.sub@heyspruce.com',
        phone: '555-0202',
        title: 'HVAC Technician',
        skills: ['HVAC Maintenance', 'Repair', 'Installation'],
        experience: '5 years',
        hourlyRate: '45',
        address: {
          street: '456 Subcontractor Ave',
          city: 'Demo City',
          state: 'DC',
          zipCode: '12345',
          country: 'USA'
        },
        businessInfo: {
          businessName: 'Demo Subcontractor LLC',
          licenseNumber: 'DEMO123',
          insuranceInfo: 'Demo Insurance Company'
        },
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        reviewedBy: 'demo.admin@heyspruce.com',
        reviewedAt: new Date().toISOString()
      }
    }
  ];

  const results = {
    created: 0,
    errors: []
  };

  for (const account of demoAccounts) {
    try {
      console.log(`🔍 Creating ${account.role} account: ${account.email}`);
      
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, account.email, account.password);
      const userId = userCredential.user.uid;
      console.log(`   ✅ Firebase Auth user created: ${userId}`);
      
      // Create user profile
      await setDoc(doc(db, 'users', userId), {
        ...account.profile,
        uid: userId
      });
      console.log(`   ✅ User profile created`);
      
      // Create role-specific data
      if (account.role === 'client' && account.registration) {
        await addDoc(collection(db, 'client_registrations'), {
          ...account.registration,
          userId: userId
        });
        console.log(`   ✅ Client registration created`);
      }
      
      if (account.role === 'subcontractor' && account.subcontractor) {
        await addDoc(collection(db, 'subcontractors'), {
          ...account.subcontractor,
          userId: userId
        });
        console.log(`   ✅ Subcontractor profile created`);
      }
      
      // Test login
      await signInWithEmailAndPassword(auth, account.email, account.password);
      console.log(`   ✅ Login test successful`);
      
      results.created++;
      console.log(`   🎉 ${account.role} account created successfully!\n`);
      
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`   ⚠️  Account already exists: ${account.email}`);
        console.log(`   🔄 Testing login...`);
        try {
          await signInWithEmailAndPassword(auth, account.email, account.password);
          console.log(`   ✅ Login successful - account is ready!\n`);
          results.created++;
        } catch (loginError) {
          console.log(`   ❌ Login failed: ${loginError.message}\n`);
          results.errors.push(`${account.email}: ${loginError.message}`);
        }
      } else {
        console.log(`   ❌ Error creating ${account.role} account: ${error.message}\n`);
        results.errors.push(`${account.email}: ${error.message}`);
      }
    }
  }

  // Summary
  console.log('📊 DEMO ACCOUNTS CREATION SUMMARY:');
  console.log(`   ✅ Accounts Created/Ready: ${results.created}/3`);
  console.log(`   ❌ Errors: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  console.log('\n🎉 DEMO ACCOUNTS READY FOR TESTING!');
  console.log('\n📝 LOGIN CREDENTIALS:');
  console.log('   Client: demo.client@heyspruce.com / demo123');
  console.log('   Admin: demo.admin@heyspruce.com / demo123');
  console.log('   Subcontractor: demo.sub@heyspruce.com / demo123');
  
  return results;
}

createDemoAccounts();
