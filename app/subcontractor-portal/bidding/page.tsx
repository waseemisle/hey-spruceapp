'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, addDoc, serverTimestamp, getDocs, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Calendar, MapPin, AlertCircle, DollarSign, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';

interface BiddingWorkOrder {
  id: string;
  workOrderId: string;
  status: string;
  sharedAt: any;
}

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  locationName: string;
  locationAddress: string;
  clientName: string;
  clientId: string;
  images?: string[];
  createdAt: any;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export default function SubcontractorBidding() {
  const [biddingWorkOrders, setBiddingWorkOrders] = useState<BiddingWorkOrder[]>([]);
  const [workOrders, setWorkOrders] = useState<Map<string, WorkOrder>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [quoteForm, setQuoteForm] = useState({
    laborCost: '',
    materialCost: '',
    taxRate: '0.0825',
    estimatedDuration: '',
    notes: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, amount: 0 },
  ]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const biddingQuery = query(
          collection(db, 'biddingWorkOrders'),
          where('subcontractorId', '==', user.uid),
          where('status', '==', 'pending'),
          orderBy('sharedAt', 'desc')
        );

        const unsubscribeSnapshot = onSnapshot(biddingQuery, async (snapshot) => {
          const biddingData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as BiddingWorkOrder[];

          setBiddingWorkOrders(biddingData);

          // Fetch work order details
          const workOrdersMap = new Map<string, WorkOrder>();
          for (const bidding of biddingData) {
            const woDoc = await getDoc(doc(db, 'workOrders', bidding.workOrderId));
            if (woDoc.exists()) {
              workOrdersMap.set(bidding.workOrderId, { id: woDoc.id, ...woDoc.data() } as WorkOrder);
            }
          }
          setWorkOrders(workOrdersMap);
          setLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleQuoteFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setQuoteForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLineItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    const newLineItems = [...lineItems];
    newLineItems[index] = { ...newLineItems[index], [field]: value };

    if (field === 'quantity' || field === 'unitPrice') {
      newLineItems[index].amount = newLineItems[index].quantity * newLineItems[index].unitPrice;
    }

    setLineItems(newLineItems);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateTotal = () => {
    const labor = parseFloat(quoteForm.laborCost) || 0;
    const material = parseFloat(quoteForm.materialCost) || 0;
    const tax = parseFloat(quoteForm.taxRate) || 0;
    const subtotal = labor + material;
    const taxAmount = subtotal * tax;
    return subtotal + taxAmount;
  };

  const handleSubmitQuote = async () => {
    if (!selectedWorkOrder) return;

    if (!quoteForm.laborCost || !quoteForm.materialCost || !quoteForm.estimatedDuration) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const subDoc = await getDoc(doc(db, 'subcontractors', currentUser.uid));
      if (!subDoc.exists()) return;

      const subData = subDoc.data();

      const labor = parseFloat(quoteForm.laborCost);
      const material = parseFloat(quoteForm.materialCost);
      const taxRate = parseFloat(quoteForm.taxRate);
      const subtotal = labor + material;
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      // Fetch client email
      const clientDoc = await getDoc(doc(db, 'clients', selectedWorkOrder.clientId));
      const clientEmail = clientDoc.exists() ? clientDoc.data().email : '';

      await addDoc(collection(db, 'quotes'), {
        workOrderId: selectedWorkOrder.id,
        workOrderTitle: selectedWorkOrder.title,
        subcontractorId: currentUser.uid,
        subcontractorName: subData.fullName || subData.businessName,
        subcontractorEmail: subData.email,
        clientId: selectedWorkOrder.clientId,
        clientName: selectedWorkOrder.clientName,
        clientEmail: clientEmail,
        laborCost: labor,
        materialCost: material,
        additionalCosts: 0,
        taxRate: taxRate,
        taxAmount: taxAmount,
        discountAmount: 0,
        totalAmount: total,
        originalAmount: total,
        estimatedDuration: quoteForm.estimatedDuration,
        lineItems: lineItems.filter(item => item.description && item.amount > 0),
        notes: quoteForm.notes,
        status: 'pending',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update biddingWorkOrder status to 'quoted' so it disappears from bidding list
      const biddingQuery = query(
        collection(db, 'biddingWorkOrders'),
        where('workOrderId', '==', selectedWorkOrder.id),
        where('subcontractorId', '==', currentUser.uid)
      );
      const biddingSnapshot = await getDocs(biddingQuery);

      if (!biddingSnapshot.empty) {
        const biddingDoc = biddingSnapshot.docs[0];
        await updateDoc(doc(db, 'biddingWorkOrders', biddingDoc.id), {
          status: 'quoted',
          quotedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast.success('Quote submitted successfully!');
      setShowQuoteForm(false);
      setSelectedWorkOrder(null);
      setQuoteForm({
        laborCost: '',
        materialCost: '',
        taxRate: '0.0825',
        estimatedDuration: '',
        notes: '',
      });
      setLineItems([{ description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
    } catch (error) {
      console.error('Error submitting quote:', error);
      toast.error('Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBiddingWorkOrders = biddingWorkOrders.filter(bidding => {
    const workOrder = workOrders.get(bidding.workOrderId);
    if (!workOrder) return false;

    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      workOrder.title.toLowerCase().includes(searchLower) ||
      workOrder.description.toLowerCase().includes(searchLower) ||
      workOrder.clientName.toLowerCase().includes(searchLower) ||
      workOrder.category.toLowerCase().includes(searchLower) ||
      workOrder.locationName.toLowerCase().includes(searchLower) ||
      workOrder.locationAddress.toLowerCase().includes(searchLower);

    return searchMatch;
  });

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800',
    };
    return styles[priority as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </SubcontractorLayout>
    );
  }

  if (showQuoteForm && selectedWorkOrder) {
    return (
      <SubcontractorLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Submit Quote</h1>
              <p className="text-gray-600 mt-2">{selectedWorkOrder.title}</p>
            </div>
            <Button variant="outline" onClick={() => {
              setShowQuoteForm(false);
              setSelectedWorkOrder(null);
            }}>
              Cancel
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="laborCost">Labor Cost *</Label>
                    <Input
                      id="laborCost"
                      name="laborCost"
                      type="number"
                      step="0.01"
                      value={quoteForm.laborCost}
                      onChange={handleQuoteFormChange}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="materialCost">Material Cost *</Label>
                    <Input
                      id="materialCost"
                      name="materialCost"
                      type="number"
                      step="0.01"
                      value={quoteForm.materialCost}
                      onChange={handleQuoteFormChange}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="taxRate">Tax Rate (decimal) *</Label>
                    <Input
                      id="taxRate"
                      name="taxRate"
                      type="number"
                      step="0.0001"
                      value={quoteForm.taxRate}
                      onChange={handleQuoteFormChange}
                      placeholder="0.0825"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="estimatedDuration">Estimated Duration *</Label>
                    <Input
                      id="estimatedDuration"
                      name="estimatedDuration"
                      value={quoteForm.estimatedDuration}
                      onChange={handleQuoteFormChange}
                      placeholder="e.g., 2-3 days"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={quoteForm.notes}
                      onChange={handleQuoteFormChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <Label>Line Items (Optional)</Label>
                    <Button type="button" onClick={addLineItem} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-5">
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Unit Price"
                            value={item.unitPrice}
                            onChange={(e) => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            value={`$${item.amount.toFixed(2)}`}
                            readOnly
                            className="bg-gray-50"
                          />
                        </div>
                        <div className="col-span-1">
                          {lineItems.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeLineItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h3 className="font-semibold text-lg mb-4">Quote Summary</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Labor Cost:</span>
                        <span className="font-semibold">${parseFloat(quoteForm.laborCost || '0').toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Material Cost:</span>
                        <span className="font-semibold">${parseFloat(quoteForm.materialCost || '0').toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-semibold">
                          ${((parseFloat(quoteForm.laborCost || '0') + parseFloat(quoteForm.materialCost || '0'))).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax ({(parseFloat(quoteForm.taxRate || '0') * 100).toFixed(2)}%):</span>
                        <span className="font-semibold">
                          ${((parseFloat(quoteForm.laborCost || '0') + parseFloat(quoteForm.materialCost || '0')) * parseFloat(quoteForm.taxRate || '0')).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xl font-bold border-t pt-2">
                        <span>Total:</span>
                        <span className="text-green-600">${calculateTotal().toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowQuoteForm(false);
                      setSelectedWorkOrder(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitQuote}
                    disabled={submitting}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {submitting ? 'Submitting...' : 'Submit Quote'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Available Work Orders</h1>
          <p className="text-gray-600 mt-2">Submit quotes for available jobs</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search work orders by title, description, client, category, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredBiddingWorkOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No work orders available</h3>
              <p className="text-gray-600 text-center">
                Check back later for new bidding opportunities
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredBiddingWorkOrders.map((bidding) => {
              const workOrder = workOrders.get(bidding.workOrderId);
              if (!workOrder) return null;

              return (
                <Card key={bidding.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{workOrder.title}</CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityBadge(workOrder.priority)}`}>
                            {workOrder.priority} priority
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            {workOrder.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Client:</p>
                      <p className="text-sm text-gray-600">{workOrder.clientName}</p>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-gray-600">
                        <div>{workOrder.locationName}</div>
                        <div className="text-xs">{workOrder.locationAddress}</div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Description:</p>
                      <p className="text-sm text-gray-600 line-clamp-3">{workOrder.description}</p>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="h-4 w-4" />
                      <span>Shared {bidding.sharedAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                    </div>

                    {workOrder.images && workOrder.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {workOrder.images.map((image, idx) => (
                          <img
                            key={idx}
                            src={image}
                            alt={`Work order ${idx + 1}`}
                            className="h-20 w-20 object-cover rounded-lg"
                          />
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        setSelectedWorkOrder(workOrder);
                        setShowQuoteForm(true);
                      }}
                      className="w-full mt-4"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Submit Quote
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </SubcontractorLayout>
  );
}
