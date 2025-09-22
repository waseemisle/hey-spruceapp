import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

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

async function testDatabaseIntegrity() {
  console.log('🗄️ COMPREHENSIVE DATABASE INTEGRITY TESTING\n');
  
  const testResults = {
    collections: {},
    relationships: {},
    dataIntegrity: {},
    errors: []
  };

  // Test all collections
  const collections = [
    'users',
    'client_registrations', 
    'subcontractors',
    'workorders',
    'quotes',
    'invoices',
    'scheduled_invoices',
    'locations'
  ];

  for (const collectionName of collections) {
    try {
      console.log(`🔍 Testing ${collectionName} collection...`);
      const snapshot = await getDocs(collection(db, collectionName));
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      testResults.collections[collectionName] = {
        count: docs.length,
        status: 'success',
        data: docs
      };
      
      console.log(`   ✅ ${collectionName}: ${docs.length} documents`);
      
      // Check for required fields
      if (docs.length > 0) {
        const sampleDoc = docs[0];
        const requiredFields = getRequiredFields(collectionName);
        const missingFields = requiredFields.filter(field => !(field in sampleDoc));
        
        if (missingFields.length > 0) {
          console.log(`   ⚠️  Missing fields: ${missingFields.join(', ')}`);
        } else {
          console.log(`   ✅ All required fields present`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ ${collectionName}: ${error.message}`);
      testResults.collections[collectionName] = {
        count: 0,
        status: 'error',
        error: error.message
      };
      testResults.errors.push(`${collectionName}: ${error.message}`);
    }
  }

  // Test data relationships
  console.log('\n🔗 Testing Data Relationships...');
  
  // Test work orders -> quotes relationship
  try {
    const workOrders = testResults.collections.workorders.data || [];
    const quotes = testResults.collections.quotes.data || [];
    
    const workOrdersWithQuotes = workOrders.filter(wo => 
      quotes.some(quote => quote.workOrderId === wo.id)
    );
    
    console.log(`   📊 Work Orders with Quotes: ${workOrdersWithQuotes.length}/${workOrders.length}`);
    testResults.relationships.workOrdersQuotes = {
      total: workOrders.length,
      withQuotes: workOrdersWithQuotes.length,
      percentage: ((workOrdersWithQuotes.length / workOrders.length) * 100).toFixed(1)
    };
  } catch (error) {
    console.log(`   ❌ Work Orders -> Quotes relationship test failed: ${error.message}`);
    testResults.errors.push(`Work Orders -> Quotes: ${error.message}`);
  }

  // Test quotes -> invoices relationship
  try {
    const quotes = testResults.collections.quotes.data || [];
    const invoices = testResults.collections.invoices.data || [];
    
    const quotesWithInvoices = quotes.filter(quote => 
      invoices.some(invoice => invoice.workOrderId === quote.workOrderId)
    );
    
    console.log(`   📊 Quotes with Invoices: ${quotesWithInvoices.length}/${quotes.length}`);
    testResults.relationships.quotesInvoices = {
      total: quotes.length,
      withInvoices: quotesWithInvoices.length,
      percentage: ((quotesWithInvoices.length / quotes.length) * 100).toFixed(1)
    };
  } catch (error) {
    console.log(`   ❌ Quotes -> Invoices relationship test failed: ${error.message}`);
    testResults.errors.push(`Quotes -> Invoices: ${error.message}`);
  }

  // Test client registrations -> users relationship
  try {
    const clientRegistrations = testResults.collections.client_registrations.data || [];
    const users = testResults.collections.users.data || [];
    
    const clientsWithUsers = clientRegistrations.filter(client => 
      users.some(user => user.uid === client.userId)
    );
    
    console.log(`   📊 Client Registrations with Users: ${clientsWithUsers.length}/${clientRegistrations.length}`);
    testResults.relationships.clientRegistrationsUsers = {
      total: clientRegistrations.length,
      withUsers: clientsWithUsers.length,
      percentage: ((clientsWithUsers.length / clientRegistrations.length) * 100).toFixed(1)
    };
  } catch (error) {
    console.log(`   ❌ Client Registrations -> Users relationship test failed: ${error.message}`);
    testResults.errors.push(`Client Registrations -> Users: ${error.message}`);
  }

  // Test data integrity
  console.log('\n🔍 Testing Data Integrity...');
  
  // Check for duplicate emails
  try {
    const clientRegistrations = testResults.collections.client_registrations.data || [];
    const emails = clientRegistrations.map(client => client.email);
    const duplicateEmails = emails.filter((email, index) => emails.indexOf(email) !== index);
    
    if (duplicateEmails.length > 0) {
      console.log(`   ⚠️  Duplicate emails found: ${duplicateEmails.length}`);
      testResults.dataIntegrity.duplicateEmails = duplicateEmails;
    } else {
      console.log(`   ✅ No duplicate emails found`);
      testResults.dataIntegrity.duplicateEmails = [];
    }
  } catch (error) {
    console.log(`   ❌ Duplicate email check failed: ${error.message}`);
    testResults.errors.push(`Duplicate emails: ${error.message}`);
  }

  // Check for missing required data
  try {
    const workOrders = testResults.collections.workorders.data || [];
    const incompleteWorkOrders = workOrders.filter(wo => 
      !wo.title || !wo.description || !wo.clientId
    );
    
    if (incompleteWorkOrders.length > 0) {
      console.log(`   ⚠️  Incomplete work orders: ${incompleteWorkOrders.length}`);
      testResults.dataIntegrity.incompleteWorkOrders = incompleteWorkOrders.length;
    } else {
      console.log(`   ✅ All work orders have required data`);
      testResults.dataIntegrity.incompleteWorkOrders = 0;
    }
  } catch (error) {
    console.log(`   ❌ Work order integrity check failed: ${error.message}`);
    testResults.errors.push(`Work order integrity: ${error.message}`);
  }

  // Summary
  console.log('\n📊 DATABASE INTEGRITY SUMMARY:');
  console.log(`   📁 Collections Tested: ${Object.keys(testResults.collections).length}`);
  console.log(`   ✅ Successful Collections: ${Object.values(testResults.collections).filter(c => c.status === 'success').length}`);
  console.log(`   ❌ Failed Collections: ${Object.values(testResults.collections).filter(c => c.status === 'error').length}`);
  
  console.log('\n📊 Collection Details:');
  Object.entries(testResults.collections).forEach(([name, data]) => {
    console.log(`   ${name}: ${data.count} documents (${data.status})`);
  });
  
  console.log('\n📊 Relationship Details:');
  Object.entries(testResults.relationships).forEach(([name, data]) => {
    console.log(`   ${name}: ${data.withQuotes || data.withInvoices || data.withUsers}/${data.total} (${data.percentage}%)`);
  });
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  } else {
    console.log('\n🎉 ALL DATABASE INTEGRITY TESTS PASSED!');
  }

  return testResults;
}

function getRequiredFields(collectionName) {
  const requiredFields = {
    'users': ['uid', 'email'],
    'client_registrations': ['email', 'contactPerson', 'status'],
    'subcontractors': ['fullName', 'email', 'status'],
    'workorders': ['title', 'description', 'clientId'],
    'quotes': ['workOrderId', 'status'],
    'invoices': ['workOrderId', 'status'],
    'scheduled_invoices': ['clientId', 'title', 'frequency'],
    'locations': ['name', 'address']
  };
  
  return requiredFields[collectionName] || [];
}

testDatabaseIntegrity();
