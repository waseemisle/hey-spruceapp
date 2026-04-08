'use client';

import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useViewControls } from '@/contexts/view-controls-context';
import { Wrench, User, MapPin, AlertCircle, Search, Eye, X, Trash2, Key, Copy, Plus, ChevronDown, ChevronUp, Code } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/ui/searchable-select';

const MAINT_REQUEST_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

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
  rawData: Record<string, any>;
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

  // Raw JSON toggle state per card
  const [expandedJsonCards, setExpandedJsonCards] = useState<Set<string>>(new Set());

  const toggleJsonCard = (id: string) => {
    setExpandedJsonCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

    const unsubscribe = onSnapshot(
      maintRequestsQuery,
      (snapshot) => {
        const requestsData = snapshot.docs.map(doc => {
          const data = doc.data();
          // Serialize Firestore timestamps to readable strings for raw JSON display
          const serializedData: Record<string, any> = { id: doc.id };
          Object.entries(data).forEach(([key, value]) => {
            if (value && typeof value === 'object' && typeof value.toDate === 'function') {
              serializedData[key] = value.toDate().toISOString();
            } else {
              serializedData[key] = value;
            }
          });
          return {
            id: doc.id,
            ...data,
            rawData: serializedData,
          };
        }) as MaintRequest[];
        setRequests(requestsData);
        setLoading(false);
      },
      (err) => {
        console.error('Maint requests listener error:', err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Fetch API tokens
  useEffect(() => {
    fetchApiTokens();
  }, []);

  const fetchApiTokens = async () => {
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const response = await fetch('/api/api-tokens', {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
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
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const response = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
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
            const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            const response = await fetch(`/api/api-tokens?id=${tokenId}`, {
              method: 'DELETE',
              headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
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
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'in-progress': return 'text-blue-600 bg-blue-50';
      case 'completed': return 'text-green-600 bg-green-50';
      default: return 'text-muted-foreground bg-muted';
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
      case 'updatedAt':
        return (
          getTimestampValue((b as any).updatedAt || b.createdAt) -
          getTimestampValue((a as any).updatedAt || a.createdAt)
        );
      case 'createdAt':
      default:
        return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
    }
  });

  const renderRequestCard = (request: MaintRequest) => (
    <div key={request.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Row 1: title + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{request.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{request.venue || request.requestor}</p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(request.status)}`}>
          {request.status}
        </span>
      </div>
      {/* Row 2: requestor + priority badge */}
      <div className="flex items-center justify-between text-sm gap-2">
        <span className="text-muted-foreground truncate">{request.requestor}</span>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getPriorityColor(request.priority)}`}>
          {request.priority}
        </span>
      </div>
      {/* Row 3: status selector */}
      <SearchableSelect
        className="w-full"
        value={request.status}
        onValueChange={(v) => handleStatusChange(request.id, v)}
        options={MAINT_REQUEST_STATUS_OPTIONS}
        placeholder="Change status"
        aria-label="Maintenance request status"
      />
      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => handleViewDetails(request)}>
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>
        <button
          onClick={() => toggleJsonCard(request.id)}
          className="h-8 px-2 border border-border rounded-md hover:bg-muted transition-colors flex items-center"
          title="Raw JSON"
        >
          <Code className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(request.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Raw JSON (collapsible) */}
      {expandedJsonCards.has(request.id) && (
        <pre className="p-3 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto max-h-60 overflow-y-auto font-mono">
          {JSON.stringify(request.rawData, null, 2)}
        </pre>
      )}
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Maintenance Requests</h1>
            <p className="text-muted-foreground mt-2">View and manage incoming maintenance requests</p>
          </div>
          <Button onClick={() => setShowTokenModal(true)} className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Tokens
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No maintenance requests found</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requestor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-gray-200">
                {sortedRequests.map((request) => (
                  <React.Fragment key={request.id}>
                    <tr className="hover:bg-muted transition-colors">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{request.title}</div>
                        <div className="text-muted-foreground text-xs mt-1 line-clamp-1">{request.description}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{request.venue}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{request.requestor}</td>
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
                      <td className="px-4 py-3 text-sm text-muted-foreground">
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
                          <button
                            onClick={() => toggleJsonCard(request.id)}
                            className="p-1.5 border border-gray-300 rounded-md hover:bg-muted transition-colors"
                            title="View Raw JSON"
                          >
                            <Code className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <SearchableSelect
                            className="w-full min-w-[120px]"
                            value={request.status}
                            onValueChange={(v) => handleStatusChange(request.id, v)}
                            options={MAINT_REQUEST_STATUS_OPTIONS}
                            placeholder="Status"
                            aria-label="Maintenance request status"
                          />
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
                    {expandedJsonCards.has(request.id) && (
                      <tr>
                        <td colSpan={7} className="px-4 py-3 bg-muted">
                          <div className="flex items-center gap-2 mb-2">
                            <Code className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground">Raw JSON Response</span>
                          </div>
                          <pre className="p-3 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto max-h-60 overflow-y-auto font-mono">
                            {JSON.stringify(request.rawData, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedRequests.map(renderRequestCard)}
          </div>
        )}

        {/* Details Modal */}
        {showModal && selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10">
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
                    <Label className="text-muted-foreground">Venue</Label>
                    <p className="text-foreground font-medium">{selectedRequest.venue}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Requestor</Label>
                    <p className="text-foreground font-medium">{selectedRequest.requestor}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Created At</Label>
                    <p className="text-foreground font-medium">
                      {selectedRequest.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-foreground mt-2 whitespace-pre-wrap">{selectedRequest.description}</p>
                </div>

                {selectedRequest.image && (
                  <div>
                    <Label className="text-muted-foreground mb-2 block">Image</Label>
                    <img
                      src={selectedRequest.image}
                      alt="Maintenance request"
                      className="max-w-full rounded-lg border"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t">
                  <div className="flex-1">
                    <Label className="text-muted-foreground mb-2 block">Update Status</Label>
                    <SearchableSelect
                      className="mt-1 w-full"
                      value={selectedRequest.status}
                      onValueChange={(v) => handleStatusChange(selectedRequest.id, v)}
                      options={MAINT_REQUEST_STATUS_OPTIONS}
                      placeholder="Status"
                      aria-label="Update maintenance request status"
                    />
                  </div>
                </div>

                {/* Raw JSON Response */}
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <Code className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-muted-foreground font-semibold">Raw JSON Response (Firebase)</Label>
                  </div>
                  <pre className="p-4 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto max-h-80 overflow-y-auto font-mono">
                    {JSON.stringify(selectedRequest.rawData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Token Management Modal */}
        {showTokenModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-card z-10">
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
                            className="font-mono text-sm bg-card"
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
                      <CardContent className="p-8 text-center text-muted-foreground">
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
                                  <Key className="h-4 w-4 text-blue-600" />
                                  <span className="font-semibold">{token.name}</span>
                                </div>
                                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                  <div className="flex gap-2">
                                    <span className="font-mono bg-muted px-2 py-1 rounded">
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
  https://groundopscos.vercel.app/api/maint-requests`}
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
