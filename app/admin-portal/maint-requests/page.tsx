'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wrench, Calendar, User, MapPin, AlertCircle, Search, Eye, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface MaintRequest {
  id: string;
  venue: string;
  requestor: string;
  date: any;
  title: string;
  description: string;
  image?: string;
  priority: string;
  status: string;
  createdAt: any;
}

export default function MaintRequestsPage() {
  const [requests, setRequests] = useState<MaintRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [selectedRequest, setSelectedRequest] = useState<MaintRequest | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const maintRequestsQuery = query(
      collection(db, 'maint_requests'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(maintRequestsQuery, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as MaintRequest[];
      setRequests(requestsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleViewDetails = (request: MaintRequest) => {
    setSelectedRequest(request);
    setShowModal(true);
  };

  const handleStatusChange = async (requestId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'maint_requests', requestId), {
        status: newStatus,
      });
      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (requestId: string) => {
    toast(`Delete this maintenance request?`, {
      description: 'This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            await deleteDoc(doc(db, 'maint_requests', requestId));
            toast.success('Request deleted successfully');
          } catch (error) {
            console.error('Error deleting request:', error);
            toast.error('Failed to delete request');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'in-progress': return 'text-blue-600 bg-blue-50';
      case 'completed': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const filteredRequests = requests.filter(request => {
    const statusMatch = filter === 'all' || request.status === filter;
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      request.title.toLowerCase().includes(searchLower) ||
      request.venue.toLowerCase().includes(searchLower) ||
      request.requestor.toLowerCase().includes(searchLower) ||
      request.description.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

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
            <h1 className="text-3xl font-bold text-gray-900">Maintenance Requests</h1>
            <p className="text-gray-600 mt-2">View and manage incoming maintenance requests</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search requests by title, venue, requestor, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'pending', 'in-progress', 'completed'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
            >
              {filterOption} ({requests.filter(r => filterOption === 'all' || r.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Requests Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRequests.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No maintenance requests found</p>
              </CardContent>
            </Card>
          ) : (
            filteredRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-lg">{request.title}</CardTitle>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityColor(request.priority)}`}>
                        {request.priority}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{request.venue}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4 flex-shrink-0" />
                    <span>{request.requestor}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>
                      {request.date?.toDate ? request.date.toDate().toLocaleDateString() : new Date(request.date).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 line-clamp-2">
                    {request.description}
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleViewDetails(request)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    <select
                      value={request.status}
                      onChange={(e) => handleStatusChange(request.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1"
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(request.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Details Modal */}
        {showModal && selectedRequest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">{selectedRequest.title}</h2>
                  <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityColor(selectedRequest.priority)}`}>
                    Priority: {selectedRequest.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedRequest.status)}`}>
                    Status: {selectedRequest.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600">Venue</Label>
                    <p className="text-gray-900 font-medium">{selectedRequest.venue}</p>
                  </div>

                  <div>
                    <Label className="text-gray-600">Requestor</Label>
                    <p className="text-gray-900 font-medium">{selectedRequest.requestor}</p>
                  </div>

                  <div>
                    <Label className="text-gray-600">Date</Label>
                    <p className="text-gray-900 font-medium">
                      {selectedRequest.date?.toDate ? selectedRequest.date.toDate().toLocaleString() : new Date(selectedRequest.date).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <Label className="text-gray-600">Created At</Label>
                    <p className="text-gray-900 font-medium">
                      {selectedRequest.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-gray-600">Description</Label>
                  <p className="text-gray-900 mt-2 whitespace-pre-wrap">{selectedRequest.description}</p>
                </div>

                {selectedRequest.image && (
                  <div>
                    <Label className="text-gray-600 mb-2 block">Image</Label>
                    <img
                      src={selectedRequest.image}
                      alt="Maintenance request"
                      className="max-w-full rounded-lg border"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t">
                  <div className="flex-1">
                    <Label className="text-gray-600 mb-2 block">Update Status</Label>
                    <select
                      value={selectedRequest.status}
                      onChange={(e) => handleStatusChange(selectedRequest.id, e.target.value)}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
