'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useViewControls } from '@/contexts/view-controls-context';
import { Wrench, User, MapPin, AlertCircle, Search, Eye, X, Trash2, Key, Copy, Plus } from 'lucide-react';
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

interface ApiToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastUsed: string | null;
}

export default function MaintRequestsPage() {
  const [requests, setRequests] = useState<MaintRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [selectedRequest, setSelectedRequest] = useState<MaintRequest | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { viewMode, sortOption } = useViewControls();

  // API Token states
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string>('');

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

  // Fetch API tokens
  useEffect(() => {
    fetchApiTokens();
  }, []);

  const fetchApiTokens = async () => {
    try {
      const response = await fetch('/api/api-tokens');
      const result = await response.json();
      if (result.success) {
        setApiTokens(result.data);
      }
    } catch (error) {
      console.error('Error fetching API tokens:', error);
    }
  };

  const handleGenerateToken = async () => {
    if (!newTokenName.trim()) {
      toast.error('Please enter a token name');
      return;
    }

    try {
      const response = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName }),
      });

      const result = await response.json();

      if (result.success) {
        setNewlyGeneratedToken(result.token);
        setNewTokenName('');
        fetchApiTokens();
        toast.success('API token generated successfully');
      } else {
        toast.error(result.error || 'Failed to generate token');
      }
    } catch (error) {
      console.error('Error generating token:', error);
      toast.error('Failed to generate token');
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    toast(`Delete this API token?`, {
      description: 'Applications using this token will lose access.',
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            const response = await fetch(`/api/api-tokens?id=${tokenId}`, {
              method: 'DELETE',
            });

            const result = await response.json();

            if (result.success) {
              fetchApiTokens();
              toast.success('Token deleted successfully');
            } else {
              toast.error(result.error || 'Failed to delete token');
            }
          } catch (error) {
            console.error('Error deleting token:', error);
            toast.error('Failed to delete token');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

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

  const getTimestampValue = (value: any) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && value?.toDate) {
      const dateValue = value.toDate();
      return dateValue instanceof Date ? dateValue.getTime() : 0;
    }
    return 0;
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

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    switch (sortOption) {
      case 'createdAt':
        return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
      case 'updatedAt':
        return (
          getTimestampValue((b as any).updatedAt || b.createdAt) -
          getTimestampValue((a as any).updatedAt || a.createdAt)
        );
      case 'alphabet':
      default:
        return (a.title || '').localeCompare(b.title || '');
    }
  });

  const renderRequestCard = (request: MaintRequest) => (
    <Card
      key={request.id}
      className={`hover:shadow-lg transition-shadow ${
        viewMode === 'list' ? 'w-full' : ''
      }`}
    >
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
  );

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
          <Button onClick={() => setShowTokenModal(true)} className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Tokens
          </Button>
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

        {/* Requests Grid/List */}
        {sortedRequests.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No maintenance requests found</p>
            </CardContent>
          </Card>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Requestor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{request.title}</div>
                      <div className="text-gray-500 text-xs mt-1 line-clamp-1">{request.description}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{request.venue}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{request.requestor}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityColor(request.priority)}`}>
                        {request.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(request.status)}`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {request.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(request)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <select
                          value={request.status}
                          onChange={(e) => handleStatusChange(request.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedRequests.map(renderRequestCard)}
          </div>
        )}

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

        {/* API Token Management Modal */}
        {showTokenModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">API Token Management</h2>
                  <Button variant="outline" size="sm" onClick={() => {
                    setShowTokenModal(false);
                    setNewlyGeneratedToken('');
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Generate New Token Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Generate New Token</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="tokenName">Token Name</Label>
                      <Input
                        id="tokenName"
                        placeholder="e.g., Mobile App, Website Integration"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleGenerateToken()}
                      />
                    </div>
                    <Button onClick={handleGenerateToken} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Generate Token
                    </Button>

                    {/* Show newly generated token */}
                    {newlyGeneratedToken && (
                      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <Label className="text-green-800 font-semibold">Token Generated Successfully!</Label>
                        <p className="text-sm text-green-700 mt-1 mb-3">
                          Copy this token now. For security reasons, it won't be shown again.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={newlyGeneratedToken}
                            readOnly
                            className="font-mono text-sm bg-white"
                          />
                          <Button
                            size="sm"
                            onClick={() => copyToClipboard(newlyGeneratedToken)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Existing Tokens List */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Active Tokens ({apiTokens.length})</h3>
                  {apiTokens.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center text-gray-500">
                        No API tokens generated yet
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {apiTokens.map((token) => (
                        <Card key={token.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Key className="h-4 w-4 text-purple-600" />
                                  <span className="font-semibold">{token.name}</span>
                                </div>
                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                  <div className="flex gap-2">
                                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                      {token.token.substring(0, 16)}...{token.token.substring(token.token.length - 8)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => copyToClipboard(token.token)}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <p>Created: {new Date(token.createdAt).toLocaleString()}</p>
                                  {token.lastUsed && (
                                    <p>Last used: {new Date(token.lastUsed).toLocaleString()}</p>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteToken(token.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Usage Instructions */}
                <Card className="bg-blue-50 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-lg text-blue-900">How to Use API Tokens</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-blue-800 space-y-2">
                    <p>Include the token in the Authorization header of your API requests:</p>
                    <pre className="bg-blue-900 text-blue-100 p-3 rounded-lg overflow-x-auto">
{`Authorization: Bearer YOUR_TOKEN_HERE`}
                    </pre>
                    <p className="mt-3">Example using curl:</p>
                    <pre className="bg-blue-900 text-blue-100 p-3 rounded-lg overflow-x-auto text-xs">
{`curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \\
  https://hey-spruce-appv2.vercel.app/api/maint-requests`}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
