import { NextRequest, NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF (dynamic import to avoid build-time issues)
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const data = await pdfParse(buffer);
    const text = data.text;

    console.log('Extracted PDF text:', text);

    // Parse the extracted text to find invoice details
    const invoiceDetails = parseInvoiceDetails(text);

    if (!invoiceDetails.clientName || !invoiceDetails.totalAmount) {
      return NextResponse.json({
        error: 'Could not extract required invoice details (client name and amount) from PDF',
        extractedText: text.substring(0, 500) // Return first 500 chars for debugging
      }, { status: 400 });
    }

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now().toString().slice(-8).toUpperCase()}`;

    // Create due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Try to find the client in the database
    let clientId = '';
    let clientEmail = '';
    const clientsQuery = query(
      collection(db, 'clients'),
      where('fullName', '==', invoiceDetails.clientName)
    );
    const clientsSnapshot = await getDocs(clientsQuery);

    if (!clientsSnapshot.empty) {
      const clientDoc = clientsSnapshot.docs[0];
      clientId = clientDoc.id;
      clientEmail = clientDoc.data().email || '';
    }

    // If no exact match, try partial match
    if (!clientId && invoiceDetails.companyName) {
      const companyQuery = query(
        collection(db, 'companies'),
        where('name', '==', invoiceDetails.companyName)
      );
      const companySnapshot = await getDocs(companyQuery);

      if (!companySnapshot.empty) {
        const companyDoc = companySnapshot.docs[0];
        const companyClientId = companyDoc.data().clientId;
        if (companyClientId) {
          const clientsQuery2 = query(
            collection(db, 'clients'),
            where('companyId', '==', companyDoc.id)
          );
          const clients2Snapshot = await getDocs(clientsQuery2);
          if (!clients2Snapshot.empty) {
            const clientDoc = clients2Snapshot.docs[0];
            clientId = clientDoc.id;
            clientEmail = clientDoc.data().email || '';
          }
        }
      }
    }

    // Create line items from the description
    const lineItems = [{
      description: invoiceDetails.description || 'Services rendered',
      quantity: 1,
      unitPrice: invoiceDetails.totalAmount,
      amount: invoiceDetails.totalAmount,
    }];

    // Create invoice in Firestore
    const invoiceData: any = {
      invoiceNumber,
      workOrderTitle: invoiceDetails.description || 'Uploaded Invoice',
      clientName: invoiceDetails.clientName,
      companyName: invoiceDetails.companyName || '',
      clientEmail: clientEmail || '',
      status: 'draft',
      totalAmount: invoiceDetails.totalAmount,
      lineItems: lineItems,
      dueDate: dueDate,
      notes: invoiceDetails.notes || 'Invoice uploaded from PDF',
      terms: 'Payment due within 30 days. Late payments may incur additional fees.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      uploadedFromPdf: true,
    };

    if (clientId) {
      invoiceData.clientId = clientId;
    }

    const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

    // Create Stripe payment link if we have client email
    if (clientEmail) {
      try {
        const stripeResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stripe/create-payment-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoiceRef.id,
            invoiceNumber: invoiceNumber,
            amount: invoiceDetails.totalAmount,
            customerEmail: clientEmail,
            clientName: invoiceDetails.clientName,
          }),
        });

        if (stripeResponse.ok) {
          const stripeData = await stripeResponse.json();
          if (stripeData.paymentLink) {
            await updateDoc(doc(db, 'invoices', invoiceRef.id), {
              stripePaymentLink: stripeData.paymentLink,
              stripeSessionId: stripeData.sessionId,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (error) {
        console.error('Failed to create Stripe payment link:', error);
        // Continue anyway - invoice is created
      }
    }

    return NextResponse.json({
      success: true,
      invoiceId: invoiceRef.id,
      invoiceNumber: invoiceNumber,
      extractedDetails: invoiceDetails,
    });

  } catch (error: any) {
    console.error('Error processing PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process PDF' },
      { status: 500 }
    );
  }
}

function parseInvoiceDetails(text: string) {
  const details: {
    clientName: string;
    companyName: string;
    totalAmount: number;
    description: string;
    notes: string;
  } = {
    clientName: '',
    companyName: '',
    totalAmount: 0,
    description: '',
    notes: '',
  };

  // Remove extra whitespace and normalize
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  // Try to extract client/company name
  // Look for patterns like "Bill To:", "Client:", "Customer:", "To:"
  const namePatterns = [
    /(?:Bill\s+To|Client|Customer|To|Billed\s+To|Invoice\s+To)[\s:]+([A-Z][A-Za-z\s&.,'-]+?)(?=\n|Address|Phone|Email|$)/i,
    /(?:Name)[\s:]+([A-Z][A-Za-z\s&.,'-]+?)(?=\n|Address|Phone|Email|$)/i,
  ];

  for (const pattern of namePatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Take the first line or up to 50 characters
      details.clientName = name.split(/\n/)[0].substring(0, 50).trim();
      break;
    }
  }

  // If no client name found, try to extract from first few lines
  if (!details.clientName) {
    const lines = text.split('\n').filter(line => line.trim().length > 3);
    // Skip invoice number and date lines, look for name-like text
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      // Check if line looks like a name (starts with capital, has at least 2 words, no numbers)
      if (/^[A-Z][A-Za-z\s&.,'-]{3,50}$/.test(line) && line.split(' ').length >= 2) {
        // Skip common header words
        if (!/(invoice|receipt|statement|bill|total|amount|date|number|qty|description|item)/i.test(line)) {
          details.clientName = line;
          break;
        }
      }
    }
  }

  // Try to extract company name (might be same as client name or separate)
  const companyPatterns = [
    /(?:Company)[\s:]+([A-Z][A-Za-z\s&.,'-]+?)(?=\n|Address|Phone|$)/i,
    /([A-Z][A-Za-z\s&]+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co\.))/,
  ];

  for (const pattern of companyPatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1]) {
      details.companyName = match[1].trim();
      break;
    }
  }

  // Extract total amount
  // Look for patterns like "Total: $1,234.56", "Amount Due: 1234.56", "Balance: $1234"
  const amountPatterns = [
    /(?:Total|Amount\s+Due|Balance|Grand\s+Total|Total\s+Amount)[\s:$]*([0-9,]+\.?\d{0,2})/i,
    /(?:Total)[\s:]*\$?\s*([0-9,]+\.?\d{0,2})/i,
    /\$\s*([0-9,]+\.\d{2})/,
  ];

  for (const pattern of amountPatterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1]) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        details.totalAmount = amount;
        break;
      }
    }
  }

  // Extract description (try to get service description or invoice purpose)
  const descPatterns = [
    /(?:Description|Services|Work\s+Performed)[\s:]+([A-Za-z0-9\s,.-]+?)(?=\n\n|\n[A-Z]|Total|Amount|$)/i,
    /(?:For|Re|Subject)[\s:]+([A-Za-z0-9\s,.-]+?)(?=\n|$)/i,
  ];

  for (const pattern of descPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      details.description = match[1].trim().substring(0, 200);
      break;
    }
  }

  // If no description found, use a generic one
  if (!details.description) {
    details.description = 'Professional services';
  }

  return details;
}
