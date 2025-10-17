const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8",
  authDomain: "heyspruceappv2.firebaseapp.com",
  projectId: "heyspruceappv2",
  storageBucket: "heyspruceappv2.firebasestorage.app",
  messagingSenderId: "198738285054",
  appId: "1:198738285054:web:6878291b080771623a70af",
  measurementId: "G-82NKE8271G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Demo data
const adminUsers = [
  {
    email: "admin1@heyspruce.com",
    password: "Admin123!",
    fullName: "John Admin",
    role: "admin"
  },
  {
    email: "admin2@heyspruce.com", 
    password: "Admin456!",
    fullName: "Sarah Manager",
    role: "admin"
  }
];

const clients = [
  {
    email: "client1@example.com",
    password: "Client123!",
    fullName: "Mike Johnson",
    companyName: "Johnson Properties LLC",
    phone: "+1-555-0101",
    address: {
      street: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "10001",
      country: "USA"
    }
  },
  {
    email: "client2@example.com",
    password: "Client456!",
    fullName: "Lisa Chen",
    companyName: "Chen Real Estate",
    phone: "+1-555-0102",
    address: {
      street: "456 Oak Avenue",
      city: "Los Angeles",
      state: "CA",
      zip: "90210",
      country: "USA"
    }
  },
  {
    email: "client3@example.com",
    password: "Client789!",
    fullName: "Robert Smith",
    companyName: "Smith Holdings",
    phone: "+1-555-0103",
    address: {
      street: "789 Pine Road",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      country: "USA"
    }
  },
  {
    email: "client4@example.com",
    password: "Client012!",
    fullName: "Emily Davis",
    companyName: "Davis Properties",
    phone: "+1-555-0104",
    address: {
      street: "321 Elm Street",
      city: "Miami",
      state: "FL",
      zip: "33101",
      country: "USA"
    }
  }
];

const subcontractors = [
  {
    email: "sub1@example.com",
    password: "Sub123!",
    fullName: "Carlos Rodriguez",
    businessName: "Rodriguez Construction",
    phone: "+1-555-0201",
    skills: ["Plumbing", "Electrical", "General Maintenance"],
    licenseNumber: "LC-2024-001",
    insuranceInfo: {
      provider: "State Farm",
      policyNumber: "SF-2024-001",
      expiryDate: "2025-12-31"
    }
  },
  {
    email: "sub2@example.com",
    password: "Sub456!",
    fullName: "David Wilson",
    businessName: "Wilson Electric",
    phone: "+1-555-0202",
    skills: ["Electrical", "HVAC", "Security Systems"],
    licenseNumber: "LE-2024-002",
    insuranceInfo: {
      provider: "Allstate",
      policyNumber: "AS-2024-002",
      expiryDate: "2025-11-30"
    }
  },
  {
    email: "sub3@example.com",
    password: "Sub789!",
    fullName: "Maria Garcia",
    businessName: "Garcia Plumbing",
    phone: "+1-555-0203",
    skills: ["Plumbing", "Water Damage", "Pipe Installation"],
    licenseNumber: "LP-2024-003",
    insuranceInfo: {
      provider: "Progressive",
      policyNumber: "PG-2024-003",
      expiryDate: "2025-10-31"
    }
  },
  {
    email: "sub4@example.com",
    password: "Sub012!",
    fullName: "James Brown",
    businessName: "Brown Handyman Services",
    phone: "+1-555-0204",
    skills: ["General Maintenance", "Painting", "Carpentry", "Flooring"],
    licenseNumber: "LH-2024-004",
    insuranceInfo: {
      provider: "Farmers",
      policyNumber: "FM-2024-004",
      expiryDate: "2025-09-30"
    }
  }
];

async function createUser(auth, email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user.uid;
  } catch (error) {
    console.error(`Error creating user ${email}:`, error.message);
    return null;
  }
}

async function createAdminUser(uid, userData) {
  const adminData = {
    uid: uid,
    email: userData.email,
    fullName: userData.fullName,
    role: "admin",
    createdAt: serverTimestamp()
  };
  
  await setDoc(doc(db, "adminUsers", uid), adminData);
  console.log(`✅ Admin created: ${userData.email} (${userData.password})`);
}

async function createClient(uid, userData) {
  const clientData = {
    uid: uid,
    email: userData.email,
    fullName: userData.fullName,
    companyName: userData.companyName,
    phone: userData.phone,
    address: userData.address,
    status: "approved",
    approvedBy: "system",
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  await setDoc(doc(db, "clients", uid), clientData);
  console.log(`✅ Client created: ${userData.email} (${userData.password})`);
}

async function createSubcontractor(uid, userData) {
  const subcontractorData = {
    uid: uid,
    email: userData.email,
    fullName: userData.fullName,
    businessName: userData.businessName,
    phone: userData.phone,
    skills: userData.skills,
    licenseNumber: userData.licenseNumber,
    insuranceInfo: userData.insuranceInfo,
    status: "approved",
    approvedBy: "system",
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  await setDoc(doc(db, "subcontractors", uid), subcontractorData);
  console.log(`✅ Subcontractor created: ${userData.email} (${userData.password})`);
}

async function createLocation(clientId, clientData, locationName) {
  const locationData = {
    clientId: clientId,
    clientName: clientData.fullName,
    clientEmail: clientData.email,
    locationName: locationName,
    address: clientData.address,
    propertyType: "Commercial",
    contactPerson: clientData.fullName,
    contactPhone: clientData.phone,
    status: "approved",
    approvedBy: "system",
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const docRef = await addDoc(collection(db, "locations"), locationData);
  return docRef.id;
}

async function createWorkOrder(workOrderData) {
  const docRef = await addDoc(collection(db, "workOrders"), workOrderData);
  return docRef.id;
}

async function createBiddingWorkOrder(biddingData) {
  const docRef = await addDoc(collection(db, "biddingWorkOrders"), biddingData);
  return docRef.id;
}

async function createQuote(quoteData) {
  const docRef = await addDoc(collection(db, "quotes"), quoteData);
  return docRef.id;
}

async function createInvoice(invoiceData) {
  const docRef = await addDoc(collection(db, "invoices"), invoiceData);
  return docRef.id;
}

async function createChat(chatData) {
  const docRef = await addDoc(collection(db, "chats"), chatData);
  return docRef.id;
}

async function createMessage(messageData) {
  const docRef = await addDoc(collection(db, "messages"), messageData);
  return docRef.id;
}

async function setupDemoData() {
  console.log("🚀 Starting demo data setup...\n");
  
  const createdUsers = {
    admins: [],
    clients: [],
    subcontractors: []
  };

  // Create Admin Users
  console.log("📋 Creating Admin Users...");
  for (const admin of adminUsers) {
    const uid = await createUser(auth, admin.email, admin.password);
    if (uid) {
      await createAdminUser(uid, admin);
      createdUsers.admins.push({ ...admin, uid });
    }
  }

  // Create Clients
  console.log("\n👥 Creating Clients...");
  for (const client of clients) {
    const uid = await createUser(auth, client.email, client.password);
    if (uid) {
      await createClient(uid, client);
      createdUsers.clients.push({ ...client, uid });
    }
  }

  // Create Subcontractors
  console.log("\n🔧 Creating Subcontractors...");
  for (const subcontractor of subcontractors) {
    const uid = await createUser(auth, subcontractor.email, subcontractor.password);
    if (uid) {
      await createSubcontractor(uid, subcontractor);
      createdUsers.subcontractors.push({ ...subcontractor, uid });
    }
  }

  // Create Work Orders
  console.log("\n📋 Creating Work Orders...");
  
  // Work Order 1: Office Renovation
  const client1 = createdUsers.clients[0];
  const location1Id = await createLocation(client1.uid, client1, "Main Office Building");
  
  const workOrder1Data = {
    workOrderNumber: "WO-2024-001",
    clientId: client1.uid,
    clientName: client1.fullName,
    clientEmail: client1.email,
    locationId: location1Id,
    location: {
      id: location1Id,
      clientId: client1.uid,
      clientName: client1.fullName,
      clientEmail: client1.email,
      locationName: "Main Office Building",
      address: client1.address,
      propertyType: "Commercial",
      contactPerson: client1.fullName,
      contactPhone: client1.phone,
      status: "approved",
      approvedBy: "system",
      approvedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    title: "Office Renovation - Conference Room",
    description: "Complete renovation of the main conference room including new flooring, lighting, and furniture installation. Need to remove old carpet, install hardwood flooring, update electrical outlets, and install new LED lighting fixtures.",
    category: "Renovation",
    categoryId: "cat-renovation",
    priority: "high",
    status: "completed",
    images: [],
    assignedTo: createdUsers.subcontractors[0].uid,
    assignedToName: createdUsers.subcontractors[0].fullName,
    assignedToEmail: createdUsers.subcontractors[0].email,
    assignedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    completionNotes: "All work completed successfully. Conference room is ready for use.",
    approvedBy: createdUsers.admins[0].uid,
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const workOrder1Id = await createWorkOrder(workOrder1Data);
  console.log(`✅ Work Order 1 created: ${workOrder1Data.workOrderNumber}`);

  // Work Order 2: HVAC Maintenance
  const client2 = createdUsers.clients[1];
  const location2Id = await createLocation(client2.uid, client2, "Retail Store Location");
  
  const workOrder2Data = {
    workOrderNumber: "WO-2024-002",
    clientId: client2.uid,
    clientName: client2.fullName,
    clientEmail: client2.email,
    locationId: location2Id,
    location: {
      id: location2Id,
      clientId: client2.uid,
      clientName: client2.fullName,
      clientEmail: client2.email,
      locationName: "Retail Store Location",
      address: client2.address,
      propertyType: "Commercial",
      contactPerson: client2.fullName,
      contactPhone: client2.phone,
      status: "approved",
      approvedBy: "system",
      approvedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    title: "HVAC System Maintenance",
    description: "Quarterly maintenance of HVAC system including filter replacement, duct cleaning, and system inspection. Need to check all units for proper operation and efficiency.",
    category: "HVAC",
    categoryId: "cat-hvac",
    priority: "medium",
    status: "completed",
    images: [],
    assignedTo: createdUsers.subcontractors[1].uid,
    assignedToName: createdUsers.subcontractors[1].fullName,
    assignedToEmail: createdUsers.subcontractors[1].email,
    assignedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    completionNotes: "HVAC system serviced and running efficiently. All filters replaced and ducts cleaned.",
    approvedBy: createdUsers.admins[0].uid,
    approvedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const workOrder2Id = await createWorkOrder(workOrder2Data);
  console.log(`✅ Work Order 2 created: ${workOrder2Data.workOrderNumber}`);

  // Create Bidding Work Orders for all subcontractors
  console.log("\n💰 Creating Bidding Work Orders...");
  
  for (const subcontractor of createdUsers.subcontractors) {
    // Bidding for Work Order 1
    const bidding1Data = {
      workOrderId: workOrder1Id,
      workOrderNumber: workOrder1Data.workOrderNumber,
      subcontractorId: subcontractor.uid,
      subcontractorName: subcontractor.fullName,
      subcontractorEmail: subcontractor.email,
      workOrderTitle: workOrder1Data.title,
      workOrderDescription: workOrder1Data.description,
      workOrderLocation: workOrder1Data.location,
      clientId: client1.uid,
      clientName: client1.fullName,
      status: "quote_submitted",
      sharedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    await createBiddingWorkOrder(bidding1Data);

    // Bidding for Work Order 2
    const bidding2Data = {
      workOrderId: workOrder2Id,
      workOrderNumber: workOrder2Data.workOrderNumber,
      subcontractorId: subcontractor.uid,
      subcontractorName: subcontractor.fullName,
      subcontractorEmail: subcontractor.email,
      workOrderTitle: workOrder2Data.title,
      workOrderDescription: workOrder2Data.description,
      workOrderLocation: workOrder2Data.location,
      clientId: client2.uid,
      clientName: client2.fullName,
      status: "quote_submitted",
      sharedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    await createBiddingWorkOrder(bidding2Data);
  }

  // Create Quotes
  console.log("\n📊 Creating Quotes...");
  
  // Quote 1 - Office Renovation (from Subcontractor 1 - Winner)
  const quote1Data = {
    workOrderId: workOrder1Id,
    workOrderNumber: workOrder1Data.workOrderNumber,
    workOrderTitle: workOrder1Data.title,
    workOrderDescription: workOrder1Data.description,
    workOrderLocation: workOrder1Data.location,
    clientId: client1.uid,
    clientName: client1.fullName,
    clientEmail: client1.email,
    subcontractorId: createdUsers.subcontractors[0].uid,
    subcontractorName: createdUsers.subcontractors[0].fullName,
    subcontractorEmail: createdUsers.subcontractors[0].email,
    laborCost: 2500,
    materialCost: 1800,
    additionalCosts: 300,
    taxRate: 8.5,
    taxAmount: 391,
    discountAmount: 0,
    totalAmount: 4991,
    originalAmount: 4991,
    clientAmount: 4991,
    markupPercentage: 15,
    lineItems: [
      { description: "Hardwood Flooring Installation", quantity: 1, unitPrice: 1200, amount: 1200 },
      { description: "LED Lighting Installation", quantity: 1, unitPrice: 600, amount: 600 },
      { description: "Electrical Outlet Updates", quantity: 1, unitPrice: 400, amount: 400 },
      { description: "Labor - Flooring", quantity: 16, unitPrice: 75, amount: 1200 },
      { description: "Labor - Electrical", quantity: 8, unitPrice: 100, amount: 800 },
      { description: "Labor - Lighting", quantity: 4, unitPrice: 125, amount: 500 },
      { description: "Materials - Electrical", quantity: 1, unitPrice: 200, amount: 200 },
      { description: "Materials - Lighting", quantity: 1, unitPrice: 400, amount: 400 },
      { description: "Cleanup and Disposal", quantity: 1, unitPrice: 300, amount: 300 }
    ],
    notes: "All work includes 1-year warranty on labor and materials.",
    terms: "Payment due within 30 days of completion. 50% deposit required to start work.",
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    status: "accepted",
    isBiddingWorkOrder: true,
    acceptedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const quote1Id = await createQuote(quote1Data);
  console.log(`✅ Quote 1 created for ${workOrder1Data.workOrderNumber}`);

  // Quote 2 - HVAC Maintenance (from Subcontractor 2 - Winner)
  const quote2Data = {
    workOrderId: workOrder2Id,
    workOrderNumber: workOrder2Data.workOrderNumber,
    workOrderTitle: workOrder2Data.title,
    workOrderDescription: workOrder2Data.description,
    workOrderLocation: workOrder2Data.location,
    clientId: client2.uid,
    clientName: client2.fullName,
    clientEmail: client2.email,
    subcontractorId: createdUsers.subcontractors[1].uid,
    subcontractorName: createdUsers.subcontractors[1].fullName,
    subcontractorEmail: createdUsers.subcontractors[1].email,
    laborCost: 800,
    materialCost: 200,
    additionalCosts: 100,
    taxRate: 8.5,
    taxAmount: 93.5,
    discountAmount: 0,
    totalAmount: 1193.5,
    originalAmount: 1193.5,
    clientAmount: 1193.5,
    markupPercentage: 15,
    lineItems: [
      { description: "HVAC System Inspection", quantity: 1, unitPrice: 150, amount: 150 },
      { description: "Filter Replacement (4 units)", quantity: 4, unitPrice: 25, amount: 100 },
      { description: "Duct Cleaning", quantity: 1, unitPrice: 300, amount: 300 },
      { description: "System Calibration", quantity: 1, unitPrice: 100, amount: 100 },
      { description: "Labor - Maintenance", quantity: 4, unitPrice: 100, amount: 400 },
      { description: "Materials - Filters", quantity: 4, unitPrice: 20, amount: 80 },
      { description: "Materials - Cleaning Supplies", quantity: 1, unitPrice: 50, amount: 50 },
      { description: "Travel and Setup", quantity: 1, unitPrice: 100, amount: 100 }
    ],
    notes: "Includes 6-month warranty on all work performed.",
    terms: "Payment due within 15 days of completion.",
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    status: "accepted",
    isBiddingWorkOrder: true,
    acceptedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const quote2Id = await createQuote(quote2Data);
  console.log(`✅ Quote 2 created for ${workOrder2Data.workOrderNumber}`);

  // Create Invoices
  console.log("\n🧾 Creating Invoices...");
  
  const invoice1Data = {
    invoiceNumber: "INV-2024-001",
    quoteId: quote1Id,
    workOrderId: workOrder1Id,
    workOrderTitle: workOrder1Data.title,
    workOrderDescription: workOrder1Data.description,
    workOrderLocation: workOrder1Data.location,
    clientId: client1.uid,
    clientName: client1.fullName,
    clientEmail: client1.email,
    subcontractorId: createdUsers.subcontractors[0].uid,
    subcontractorName: createdUsers.subcontractors[0].fullName,
    subcontractorEmail: createdUsers.subcontractors[0].email,
    status: "sent",
    totalAmount: 4991,
    laborCost: 2500,
    materialCost: 1800,
    additionalCosts: 300,
    taxRate: 8.5,
    taxAmount: 391,
    discountAmount: 0,
    lineItems: quote1Data.lineItems,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    notes: "Thank you for choosing our services. Please remit payment by the due date.",
    terms: "Payment due within 30 days of invoice date. Late payments subject to 1.5% monthly service charge.",
    createdBy: createdUsers.admins[0].uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const invoice1Id = await createInvoice(invoice1Data);
  console.log(`✅ Invoice 1 created: ${invoice1Data.invoiceNumber}`);

  const invoice2Data = {
    invoiceNumber: "INV-2024-002",
    quoteId: quote2Id,
    workOrderId: workOrder2Id,
    workOrderTitle: workOrder2Data.title,
    workOrderDescription: workOrder2Data.description,
    workOrderLocation: workOrder2Data.location,
    clientId: client2.uid,
    clientName: client2.fullName,
    clientEmail: client2.email,
    subcontractorId: createdUsers.subcontractors[1].uid,
    subcontractorName: createdUsers.subcontractors[1].fullName,
    subcontractorEmail: createdUsers.subcontractors[1].email,
    status: "paid",
    totalAmount: 1193.5,
    laborCost: 800,
    materialCost: 200,
    additionalCosts: 100,
    taxRate: 8.5,
    taxAmount: 93.5,
    discountAmount: 0,
    lineItems: quote2Data.lineItems,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
    paidAt: serverTimestamp(),
    notes: "Thank you for your prompt payment.",
    terms: "Payment due within 15 days of invoice date.",
    createdBy: createdUsers.admins[0].uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const invoice2Id = await createInvoice(invoice2Data);
  console.log(`✅ Invoice 2 created: ${invoice2Data.invoiceNumber}`);

  // Create Chat conversations
  console.log("\n💬 Creating Chat Conversations...");
  
  // Chat between Admin and Client 1
  const chat1Data = {
    participants: [createdUsers.admins[0].uid, client1.uid],
    participantDetails: [
      { id: createdUsers.admins[0].uid, name: createdUsers.admins[0].fullName, email: createdUsers.admins[0].email, role: "admin" },
      { id: client1.uid, name: client1.fullName, email: client1.email, role: "client" }
    ],
    lastMessage: "Thank you for approving the quote. We'll start work immediately.",
    lastMessageTimestamp: serverTimestamp(),
    lastMessageSenderId: createdUsers.admins[0].uid,
    unreadCount: { [client1.uid]: 0, [createdUsers.admins[0].uid]: 0 },
    createdBy: createdUsers.admins[0].uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const chat1Id = await createChat(chat1Data);
  
  // Chat between Admin and Subcontractor 1
  const chat2Data = {
    participants: [createdUsers.admins[0].uid, createdUsers.subcontractors[0].uid],
    participantDetails: [
      { id: createdUsers.admins[0].uid, name: createdUsers.admins[0].fullName, email: createdUsers.admins[0].email, role: "admin" },
      { id: createdUsers.subcontractors[0].uid, name: createdUsers.subcontractors[0].fullName, email: createdUsers.subcontractors[0].email, role: "subcontractor" }
    ],
    lastMessage: "Work order completed successfully. Please review and confirm.",
    lastMessageTimestamp: serverTimestamp(),
    lastMessageSenderId: createdUsers.subcontractors[0].uid,
    unreadCount: { [createdUsers.subcontractors[0].uid]: 0, [createdUsers.admins[0].uid]: 0 },
    createdBy: createdUsers.admins[0].uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  const chat2Id = await createChat(chat2Data);

  // Create sample messages
  const messages = [
    // Admin to Client 1
    {
      chatId: chat1Id,
      senderId: createdUsers.admins[0].uid,
      senderName: createdUsers.admins[0].fullName,
      senderRole: "admin",
      receiverId: client1.uid,
      receiverName: client1.fullName,
      content: "Hi Mike, I've received your work order request for the office renovation. I'll review it and get back to you shortly.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    {
      chatId: chat1Id,
      senderId: createdUsers.admins[0].uid,
      senderName: createdUsers.admins[0].fullName,
      senderRole: "admin",
      receiverId: client1.uid,
      receiverName: client1.fullName,
      content: "I've approved your work order and sent it to our subcontractors for quotes. You should receive quotes within 24-48 hours.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago
    },
    {
      chatId: chat1Id,
      senderId: client1.uid,
      senderName: client1.fullName,
      senderRole: "client",
      receiverId: createdUsers.admins[0].uid,
      receiverName: createdUsers.admins[0].fullName,
      content: "Great! I've reviewed the quotes and I approve the one from Rodriguez Construction. Please proceed.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
    },
    {
      chatId: chat1Id,
      senderId: createdUsers.admins[0].uid,
      senderName: createdUsers.admins[0].fullName,
      senderRole: "admin",
      receiverId: client1.uid,
      receiverName: client1.fullName,
      content: "Perfect! I've assigned the work to Rodriguez Construction. They'll start work tomorrow. I'll keep you updated on the progress.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
    },
    {
      chatId: chat1Id,
      senderId: createdUsers.admins[0].uid,
      senderName: createdUsers.admins[0].fullName,
      senderRole: "admin",
      receiverId: client1.uid,
      receiverName: client1.fullName,
      content: "The work order has been completed successfully! I've sent you the final invoice. Please review and make payment when convenient.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    },
    // Admin to Subcontractor 1
    {
      chatId: chat2Id,
      senderId: createdUsers.admins[0].uid,
      senderName: createdUsers.admins[0].fullName,
      senderRole: "admin",
      receiverId: createdUsers.subcontractors[0].uid,
      receiverName: createdUsers.subcontractors[0].fullName,
      content: "Hi Carlos, I've assigned work order WO-2024-001 to you. Please confirm you can start work tomorrow.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
    },
    {
      chatId: chat2Id,
      senderId: createdUsers.subcontractors[0].uid,
      senderName: createdUsers.subcontractors[0].fullName,
      senderRole: "subcontractor",
      receiverId: createdUsers.admins[0].uid,
      receiverName: createdUsers.admins[0].fullName,
      content: "Yes, I can start tomorrow. I'll be on site at 8 AM to begin the renovation work.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
    },
    {
      chatId: chat2Id,
      senderId: createdUsers.subcontractors[0].uid,
      senderName: createdUsers.subcontractors[0].fullName,
      senderRole: "subcontractor",
      receiverId: createdUsers.admins[0].uid,
      receiverName: createdUsers.admins[0].fullName,
      content: "I've started working on the office renovation. Everything is going smoothly so far.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      chatId: chat2Id,
      senderId: createdUsers.admins[0].uid,
      senderName: createdUsers.admins[0].fullName,
      senderRole: "admin",
      receiverId: createdUsers.subcontractors[0].uid,
      receiverName: createdUsers.subcontractors[0].fullName,
      content: "Great! Keep me updated on the progress. Let me know if you need anything.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      chatId: chat2Id,
      senderId: createdUsers.subcontractors[0].uid,
      senderName: createdUsers.subcontractors[0].fullName,
      senderRole: "subcontractor",
      receiverId: createdUsers.admins[0].uid,
      receiverName: createdUsers.admins[0].fullName,
      content: "Work order WO-2024-001 has been completed successfully. All renovation work is done and the conference room is ready for use.",
      attachments: [],
      seen: true,
      seenAt: serverTimestamp(),
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    }
  ];

  for (const message of messages) {
    await createMessage(message);
  }

  console.log(`✅ Created ${messages.length} chat messages`);

  // Print summary
  console.log("\n🎉 Demo data setup completed successfully!\n");
  console.log("📋 USER CREDENTIALS:");
  console.log("\n👑 ADMIN USERS:");
  createdUsers.admins.forEach((admin, index) => {
    console.log(`${index + 1}. Email: ${admin.email} | Password: ${admin.password} | Name: ${admin.fullName}`);
  });
  
  console.log("\n👥 CLIENTS:");
  createdUsers.clients.forEach((client, index) => {
    console.log(`${index + 1}. Email: ${client.email} | Password: ${client.password} | Name: ${client.fullName} | Company: ${client.companyName}`);
  });
  
  console.log("\n🔧 SUBCONTRACTORS:");
  createdUsers.subcontractors.forEach((sub, index) => {
    console.log(`${index + 1}. Email: ${sub.email} | Password: ${sub.password} | Name: ${sub.fullName} | Business: ${sub.businessName}`);
  });

  console.log("\n📋 WORK ORDERS CREATED:");
  console.log("1. WO-2024-001: Office Renovation - Conference Room (COMPLETED)");
  console.log("2. WO-2024-002: HVAC System Maintenance (COMPLETED)");

  console.log("\n💰 QUOTES CREATED:");
  console.log("1. Quote for WO-2024-001: $4,991 (ACCEPTED)");
  console.log("2. Quote for WO-2024-002: $1,193.50 (ACCEPTED)");

  console.log("\n🧾 INVOICES CREATED:");
  console.log("1. INV-2024-001: $4,991 (SENT)");
  console.log("2. INV-2024-002: $1,193.50 (PAID)");

  console.log("\n💬 CHAT CONVERSATIONS:");
  console.log("1. Admin ↔ Client 1 (Office Renovation)");
  console.log("2. Admin ↔ Subcontractor 1 (Work Assignment)");

  console.log("\n✨ All data has been created with complete end-to-end workflows!");
  console.log("You can now test the full application flow with these accounts.");
}

// Run the setup
setupDemoData().catch(console.error);
