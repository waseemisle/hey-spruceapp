'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Search, Users, CheckCircle2, XCircle, Save, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  clientId: string;
  logoUrl?: string;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  companyId?: string;
  permissions?: {
    shareForBidding?: boolean;
    viewMaintenanceRequests?: boolean;
    viewMaintenanceRequestsWorkOrders?: boolean;
    approveRejectOrder?: boolean;
    rejectedWorkOrders?: boolean;
    viewSubcontractors?: boolean;
    compareQuotes?: boolean;
    viewRecurringWorkOrders?: boolean;
    viewTimeline?: boolean;
  };
}

export default function CompaniesPermissions() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [clientPermissions, setClientPermissions] = useState<Record<string, Client['permissions']>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [companiesSnap, clientsSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies'))),
        getDocs(query(collection(db, 'clients'))),
      ]);

      const comps = companiesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Company[];

      const cls = clientsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        permissions: d.data().permissions || {},
      })) as Client[];

      setCompanies(comps);
      setClients(cls);

      // Initialize permissions state
      const permissionsMap: Record<string, Client['permissions']> = {};
      cls.forEach((client) => {
        permissionsMap[client.id] = {
          shareForBidding: client.permissions?.shareForBidding || false,
          viewMaintenanceRequests: client.permissions?.viewMaintenanceRequests || false,
          viewMaintenanceRequestsWorkOrders: client.permissions?.viewMaintenanceRequestsWorkOrders || false,
          approveRejectOrder: client.permissions?.approveRejectOrder || false,
          rejectedWorkOrders: client.permissions?.rejectedWorkOrders || false,
          viewSubcontractors: client.permissions?.viewSubcontractors || false,
          compareQuotes: client.permissions?.compareQuotes || false,
          viewRecurringWorkOrders: client.permissions?.viewRecurringWorkOrders || false,
          viewTimeline: client.permissions?.viewTimeline || false,
        };
      });
      setClientPermissions(permissionsMap);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handlePermissionChange = (clientId: string, permission: 'shareForBidding' | 'viewMaintenanceRequests' | 'viewMaintenanceRequestsWorkOrders' | 'approveRejectOrder' | 'rejectedWorkOrders' | 'viewSubcontractors' | 'compareQuotes' | 'viewRecurringWorkOrders' | 'viewTimeline', value: boolean) => {
    setClientPermissions((prev) => ({
      ...prev,
      [clientId]: {
        ...prev[clientId],
        [permission]: value,
      },
    }));
  };

  const handleSavePermissions = async (clientId: string) => {
    setSaving(clientId);
    try {
      const permissions = clientPermissions[clientId];
      await updateDoc(doc(db, 'clients', clientId), {
        permissions: permissions || {},
        updatedAt: serverTimestamp(),
      });
      toast.success('Permissions updated successfully');
      fetchAll(); // Refresh to sync state
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to update permissions');
    } finally {
      setSaving(null);
    }
  };

  const getCompanyClients = (companyId: string) => {
    return clients.filter((c) => c.companyId === companyId);
  };

  const filtered = companies.filter((c) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q);
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
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-8 w-8" />
              Companies Permissions
            </h1>
            <p className="text-gray-600 mt-2">Manage permissions for companies and their clients</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No companies found</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((company) => {
              const companyClients = getCompanyClients(company.id);
              const isExpanded = expandedCompany === company.id;

              return (
                <Card key={company.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {company.logoUrl && (
                          <img
                            src={company.logoUrl}
                            alt={company.name}
                            className="h-12 w-12 object-contain rounded"
                          />
                        )}
                        <div>
                          <CardTitle className="text-lg">{company.name}</CardTitle>
                          <p className="text-sm text-gray-500 mt-1">
                            {companyClients.length} client{companyClients.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </Button>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent>
                      {companyClients.length === 0 ? (
                        <div className="text-center py-8">
                          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">No clients associated with this company</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid gap-4">
                            {companyClients.map((client) => {
                              const permissions = clientPermissions[client.id] || {
                                shareForBidding: false,
                                viewMaintenanceRequests: false,
                                viewMaintenanceRequestsWorkOrders: false,
                                approveRejectOrder: false,
                                rejectedWorkOrders: false,
                                viewSubcontractors: false,
                                compareQuotes: false,
                                viewRecurringWorkOrders: false,
                                viewTimeline: false,
                              };
                              const isSaving = saving === client.id;

                              return (
                                <Card key={client.id} className="bg-gray-50">
                                  <CardContent className="p-4">
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <h3 className="font-semibold text-gray-900">{client.fullName}</h3>
                                          <p className="text-sm text-gray-600">{client.email}</p>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => handleSavePermissions(client.id)}
                                          disabled={isSaving}
                                        >
                                          <Save className="h-4 w-4 mr-2" />
                                          {isSaving ? 'Saving...' : 'Save'}
                                        </Button>
                                      </div>

                                      <div className="space-y-3 pt-2 border-t">
                                        {/* Permission 1: Share for Bidding */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`share-${client.id}`}
                                            checked={permissions.shareForBidding || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'shareForBidding',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`share-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              Share for Bidding
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to share work orders with subcontractors for bidding.
                                              When enabled, the client can select subcontractors and share work orders.
                                              Subcontractor quotes will be shared with the client (without markup).
                                            </p>
                                          </div>
                                          {permissions.shareForBidding ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 2: View Maintenance Requests */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`maint-${client.id}`}
                                            checked={permissions.viewMaintenanceRequests || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'viewMaintenanceRequests',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`maint-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              View Maintenance Requests
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to view maintenance requests in their portal.
                                            </p>
                                          </div>
                                          {permissions.viewMaintenanceRequests ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission: Maintenance Requests Work Orders */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`maint-work-orders-${client.id}`}
                                            checked={permissions.viewMaintenanceRequestsWorkOrders || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'viewMaintenanceRequestsWorkOrders',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`maint-work-orders-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              Maintenance Requests Work Orders
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to view maintenance requests work orders in their portal. The nav will show as &quot;Maintenance Requests Work Orders&quot;.
                                            </p>
                                          </div>
                                          {permissions.viewMaintenanceRequestsWorkOrders ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 3: Approve/Reject Order */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`approve-reject-${client.id}`}
                                            checked={permissions.approveRejectOrder || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'approveRejectOrder',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`approve-reject-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              Approve/Reject Order
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to approve or reject work orders in their portal.
                                            </p>
                                          </div>
                                          {permissions.approveRejectOrder ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 4: Rejected Work Orders */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`rejected-${client.id}`}
                                            checked={permissions.rejectedWorkOrders || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'rejectedWorkOrders',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`rejected-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              Rejected Work Orders
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to view rejected work orders in their portal.
                                            </p>
                                          </div>
                                          {permissions.rejectedWorkOrders ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 5: View Subcontractors */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`subcontractors-${client.id}`}
                                            checked={permissions.viewSubcontractors || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'viewSubcontractors',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`subcontractors-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              View Subcontractors
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to view all subcontractors in their portal (read-only).
                                            </p>
                                          </div>
                                          {permissions.viewSubcontractors ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 6: Compare Quotes */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`compare-quotes-${client.id}`}
                                            checked={permissions.compareQuotes || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'compareQuotes',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`compare-quotes-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              Compare Quotes
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to compare multiple quotes side-by-side for work orders with detailed subcontractor information.
                                            </p>
                                          </div>
                                          {permissions.compareQuotes ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 7: Recurring Work Orders */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`recurring-work-orders-${client.id}`}
                                            checked={permissions.viewRecurringWorkOrders || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'viewRecurringWorkOrders',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`recurring-work-orders-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              Recurring Work Orders
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to view and edit recurring work orders in their portal.
                                            </p>
                                          </div>
                                          {permissions.viewRecurringWorkOrders ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>

                                        {/* Permission 8: View Timeline */}
                                        <div className="flex items-start gap-3">
                                          <Checkbox
                                            id={`view-timeline-${client.id}`}
                                            checked={permissions.viewTimeline || false}
                                            onCheckedChange={(checked) =>
                                              handlePermissionChange(
                                                client.id,
                                                'viewTimeline',
                                                checked === true
                                              )
                                            }
                                          />
                                          <div className="flex-1">
                                            <Label
                                              htmlFor={`view-timeline-${client.id}`}
                                              className="font-medium cursor-pointer"
                                            >
                                              View Timeline
                                            </Label>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Allows this client to see the Timeline section (how it was created, approved by, activity timeline) on work orders, quotes, and invoices in their portal. When disabled, only admins see timelines.
                                            </p>
                                          </div>
                                          {permissions.viewTimeline ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-5 w-5 text-gray-300" />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

