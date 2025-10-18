'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Share2, UserPlus, ClipboardList, Image as ImageIcon, Plus, Edit2, Save, X, Search } from 'lucide-react';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  locationId: string;
  locationName?: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'bidding' | 'quotes_received' | 'assigned' | 'completed';
  images: string[];
  assignedTo?: string;
  assignedToName?: string;
  createdAt: any;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
}

interface Location {
  id: string;
  clientId: string;
  locationName: string;
  address: {
    street: string;
    city: string;
    state: string;
  };
}

export default function WorkOrdersManagement() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'bidding' | 'assigned' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    status: 'approved' as WorkOrder['status'],
  });

  const fetchWorkOrders = async () => {
    try {
      const workOrdersQuery = query(collection(db, 'workOrders'));
      const snapshot = await getDocs(workOrdersQuery);
      const workOrdersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkOrder[];
      setWorkOrders(workOrdersData);
    } catch (error) {
      console.error('Error fetching work orders:', error);
      alert('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        clientId: doc.data().clientId,
        locationName: doc.data().locationName,
        address: doc.data().address,
      })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
    fetchClients();
    fetchLocations();
  }, []);

  const handleApprove = async (workOrderId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert('Work order approved successfully');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error approving work order:', error);
      alert('Failed to approve work order');
    }
  };

  const handleReject = async (workOrderId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const reason = prompt('Enter rejection reason:');
      if (!reason) return;

      await updateDoc(doc(db, 'workOrders', workOrderId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      });

      alert('Work order rejected');
      fetchWorkOrders();
    } catch (error) {
      console.error('Error rejecting work order:', error);
      alert('Failed to reject work order');
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
      locationId: '',
      title: '',
      description: '',
      category: '',
      priority: 'medium',
      status: 'approved',
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (workOrder: WorkOrder) => {
    setFormData({
      clientId: workOrder.clientId,
      locationId: workOrder.locationId,
      title: workOrder.title,
      description: workOrder.description,
      category: workOrder.category,
      priority: workOrder.priority,
      status: workOrder.status,
    });
    setEditingId(workOrder.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.locationId || !formData.title || !formData.description || !formData.category) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const client = clients.find(c => c.id === formData.clientId);
      const location = locations.find(l => l.id === formData.locationId);

      if (!client || !location) {
        alert('Invalid client or location selected');
        return;
      }

      const workOrderData = {
        clientId: formData.clientId,
        clientName: client.fullName,
        clientEmail: client.email,
        locationId: formData.locationId,
        locationName: location.locationName,
        locationAddress: `${location.address.street}, ${location.address.city}, ${location.address.state}`,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        status: formData.status,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        // Update existing work order
        await updateDoc(doc(db, 'workOrders', editingId), workOrderData);
        alert('Work order updated successfully');
      } else {
        // Create new work order
        const workOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}`;
        await addDoc(collection(db, 'workOrders'), {
          ...workOrderData,
          workOrderNumber,
          images: [],
          createdAt: serverTimestamp(),
        });
        alert('Work order created successfully');
      }

      resetForm();
      fetchWorkOrders();
    } catch (error: any) {
      console.error('Error saving work order:', error);
      alert(error.message || 'Failed to save work order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareForBidding = async (workOrder: WorkOrder) => {
    try {
      // Get all approved subcontractors
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const subsSnapshot = await getDocs(subsQuery);

      if (subsSnapshot.empty) {
        alert('No approved subcontractors found');
        return;
      }

      // Create bidding work order for each subcontractor
      const promises = subsSnapshot.docs.map(async (subDoc) => {
        const sub = subDoc.data();
        await addDoc(collection(db, 'biddingWorkOrders'), {
          workOrderId: workOrder.id,
          workOrderNumber: workOrder.workOrderNumber,
          subcontractorId: subDoc.id,
          subcontractorName: sub.fullName,
          subcontractorEmail: sub.email,
          workOrderTitle: workOrder.title,
          workOrderDescription: workOrder.description,
          clientId: workOrder.clientId,
          clientName: workOrder.clientName,
          status: 'pending',
          sharedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });

      await Promise.all(promises);

      // Update work order status
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'bidding',
        sharedForBiddingAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert(`Work order shared with ${subsSnapshot.size} subcontractors for bidding`);
      fetchWorkOrders();
    } catch (error) {
      console.error('Error sharing for bidding:', error);
      alert('Failed to share work order for bidding');
    }
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    // Filter by status
    const statusMatch = filter === 'all' || wo.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      wo.title.toLowerCase().includes(searchLower) ||
      wo.description.toLowerCase().includes(searchLower) ||
      wo.clientName.toLowerCase().includes(searchLower) ||
      wo.workOrderNumber.toLowerCase().includes(searchLower) ||
      wo.category.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      case 'bidding': return 'text-blue-600 bg-blue-50';
      case 'quotes_received': return 'text-purple-600 bg-purple-50';
      case 'assigned': return 'text-indigo-600 bg-indigo-50';
      case 'completed': return 'text-emerald-600 bg-emerald-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Orders</h1>
            <p className="text-gray-600 mt-2">Manage work orders and assignments</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Work Order
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search work orders by title, description, client, number, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'approved', 'bidding', 'assigned', 'completed'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
              size="sm"
            >
              {filterOption} ({workOrders.filter(w => filterOption === 'all' || w.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Work Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkOrders.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No work orders found</p>
              </CardContent>
            </Card>
          ) : (
            filteredWorkOrders.map((workOrder) => (
              <Card key={workOrder.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{workOrder.title}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(workOrder.status)}`}>
                        {workOrder.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getPriorityColor(workOrder.priority)}`}>
                        {workOrder.priority.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-semibold">
                        {workOrder.workOrderNumber}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-600 line-clamp-2">{workOrder.description}</p>

                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-semibold">Client:</span> {workOrder.clientName}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">Category:</span> {workOrder.category}
                    </div>
                    {workOrder.assignedToName && (
                      <div className="text-sm">
                        <span className="font-semibold">Assigned to:</span> {workOrder.assignedToName}
                      </div>
                    )}
                  </div>

                  {workOrder.images && workOrder.images.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <ImageIcon className="h-4 w-4" />
                      <span>{workOrder.images.length} image(s)</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-4 space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleOpenEdit(workOrder)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Work Order
                    </Button>

                    {workOrder.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleApprove(workOrder.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => handleReject(workOrder.id)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {workOrder.status === 'approved' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleShareForBidding(workOrder)}
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share for Bidding
                      </Button>
                    )}

                    {workOrder.status === 'quotes_received' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => window.location.href = `/admin-portal/quotes?workOrderId=${workOrder.id}`}
                      >
                        View Quotes
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {editingId ? 'Edit Work Order' : 'Create New Work Order'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Select Client *</Label>
                    <select
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value, locationId: '' })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Choose a client...</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.fullName} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>Select Location *</Label>
                    <select
                      value={formData.locationId}
                      onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2"
                      disabled={!formData.clientId}
                    >
                      <option value="">Choose a location...</option>
                      {locations
                        .filter(loc => loc.clientId === formData.clientId)
                        .map(location => (
                          <option key={location.id} value={location.id}>
                            {location.locationName}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <Label>Work Order Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., HVAC Repair Needed"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label>Description *</Label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
                      placeholder="Detailed description of the work needed..."
                    />
                  </div>

                  <div>
                    <Label>Category *</Label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Select category...</option>
                      <option value="HVAC">HVAC</option>
                      <option value="Plumbing">Plumbing</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Carpentry">Carpentry</option>
                      <option value="Painting">Painting</option>
                      <option value="Roofing">Roofing</option>
                      <option value="Landscaping">Landscaping</option>
                      <option value="Cleaning">Cleaning</option>
                      <option value="Appliance Repair">Appliance Repair</option>
                      <option value="General Maintenance">General Maintenance</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <Label>Priority *</Label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <Label>Status *</Label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="bidding">Bidding</option>
                      <option value="quotes_received">Quotes Received</option>
                      <option value="assigned">Assigned</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
