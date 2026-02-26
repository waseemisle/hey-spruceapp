'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Save, X, Search, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface Location {
  id: string;
  locationName: string;
  address?: {
    street: string;
    city: string;
    state: string;
  };
}

interface LocationMapping {
  id: string;
  csvLocationName: string;
  systemLocationId: string;
  systemLocationName?: string;
  createdAt: any;
  updatedAt: any;
}

export default function LocationMapPage() {
  const [mappings, setMappings] = useState<LocationMapping[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    csvLocationName: '',
    systemLocationId: '',
  });

  // Pre-defined mappings from requirements
  const predefinedMappings = [
    { csv: 'Delilah (West Hollywood)', system: 'Delilah LA' },
    { csv: 'Keys (Sunset Blvd, West Hollywood)', system: 'Keys Nightclub' },
    { csv: 'Poppy (West Hollywood)', system: 'Poppy' },
    { csv: 'The Bird Streets Club (Sunset, West Hollywood)', system: 'Bird Streets' },
    { csv: 'The Nice Guy (Cienega, West Hollywood)', system: 'The Nice Guy' },
    { csv: 'Delilah (Miami)', system: 'Delilah Miami' },
  ];

  const fetchMappings = async () => {
    try {
      const mappingsQuery = query(collection(db, 'locationMappings'));
      const snapshot = await getDocs(mappingsQuery);
      const mappingsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as LocationMapping;
      });
      setMappings(mappingsData);
    } catch (error) {
      console.error('Error fetching location mappings:', error);
      toast.error('Failed to load location mappings');
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        locationName: doc.data().locationName,
        address: doc.data().address,
      })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
      toast.error('Failed to load locations');
    }
  };

  useEffect(() => {
    fetchMappings();
    fetchLocations();
  }, []);

  const handleCreatePredefinedMappings = async () => {
    try {
      setSubmitting(true);
      let created = 0;
      let skipped = 0;

      for (const mapping of predefinedMappings) {
        // Check if mapping already exists
        const existingMapping = mappings.find(
          m => m.csvLocationName === mapping.csv
        );
        
        if (existingMapping) {
          skipped++;
          continue;
        }

        // Find system location by name
        const systemLocation = locations.find(
          l => l.locationName === mapping.system
        );

        if (systemLocation) {
          await setDoc(doc(collection(db, 'locationMappings')), {
            csvLocationName: mapping.csv,
            systemLocationId: systemLocation.id,
            systemLocationName: systemLocation.locationName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          created++;
        } else {
          toast.warning(`Location "${mapping.system}" not found in system. Please create it first.`);
        }
      }

      if (created > 0) {
        toast.success(`Created ${created} predefined mapping(s). ${skipped} already existed.`);
        fetchMappings();
      } else if (skipped > 0) {
        toast.info('All predefined mappings already exist.');
      }
    } catch (error) {
      console.error('Error creating predefined mappings:', error);
      toast.error('Failed to create predefined mappings');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenModal = (mapping?: LocationMapping) => {
    if (mapping) {
      setEditingId(mapping.id);
      setFormData({
        csvLocationName: mapping.csvLocationName,
        systemLocationId: mapping.systemLocationId,
      });
    } else {
      setEditingId(null);
      setFormData({
        csvLocationName: '',
        systemLocationId: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({
      csvLocationName: '',
      systemLocationId: '',
    });
  };

  const handleSubmit = async () => {
    if (!formData.csvLocationName || !formData.systemLocationId) {
      toast.error('Please fill in all fields');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in');
        return;
      }

      const selectedLocation = locations.find(l => l.id === formData.systemLocationId);
      if (!selectedLocation) {
        toast.error('Selected location not found');
        return;
      }

      const mappingData = {
        csvLocationName: formData.csvLocationName.trim(),
        systemLocationId: formData.systemLocationId,
        systemLocationName: selectedLocation.locationName,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await setDoc(doc(db, 'locationMappings', editingId), mappingData, { merge: true });
        toast.success('Location mapping updated successfully');
      } else {
        // Check for duplicates
        const existingMapping = mappings.find(
          m => m.csvLocationName.toLowerCase() === formData.csvLocationName.trim().toLowerCase()
        );
        if (existingMapping) {
          toast.error('A mapping with this CSV location name already exists');
          setSubmitting(false);
          return;
        }

        await setDoc(doc(collection(db, 'locationMappings')), {
          ...mappingData,
          createdAt: serverTimestamp(),
        });
        toast.success('Location mapping created successfully');
      }

      handleCloseModal();
      fetchMappings();
    } catch (error: any) {
      console.error('Error saving location mapping:', error);
      toast.error(error.message || 'Failed to save location mapping');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (mapping: LocationMapping) => {
    toast(`Delete location mapping "${mapping.csvLocationName}"?`, {
      description: 'This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          try {
            await deleteDoc(doc(db, 'locationMappings', mapping.id));
            toast.success('Location mapping deleted successfully');
            fetchMappings();
          } catch (error) {
            console.error('Error deleting location mapping:', error);
            toast.error('Failed to delete location mapping');
          }
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const filteredMappings = mappings.filter(mapping => {
    const searchLower = searchQuery.toLowerCase();
    return (
      mapping.csvLocationName.toLowerCase().includes(searchLower) ||
      (mapping.systemLocationName || '').toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Location Map</h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">
              Map CSV location names to system locations for recurring work order imports
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCreatePredefinedMappings}
              variant="outline"
              loading={submitting} disabled={submitting}
              className="w-full sm:w-auto"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Create Predefined Mappings
            </Button>
            <Button
              onClick={() => handleOpenModal()}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Mapping</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search mappings by CSV location name or system location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Mappings Table */}
        <Card>
          <CardHeader>
            <CardTitle>Location Mappings ({filteredMappings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredMappings.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No location mappings found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Create mappings to link CSV location names to system locations
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold text-gray-700">CSV Location Name</th>
                      <th className="text-left p-3 font-semibold text-gray-700">System Location</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map((mapping) => (
                      <tr key={mapping.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-gray-900">{mapping.csvLocationName}</td>
                        <td className="p-3 text-gray-600">{mapping.systemLocationName || 'N/A'}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenModal(mapping)}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(mapping)}
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
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{editingId ? 'Edit Location Mapping' : 'Add Location Mapping'}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={handleCloseModal}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="csvLocationName">CSV Location Name *</Label>
                  <Input
                    id="csvLocationName"
                    value={formData.csvLocationName}
                    onChange={(e) => setFormData({ ...formData, csvLocationName: e.target.value })}
                    placeholder="e.g., Delilah (West Hollywood)"
                  />
                </div>
                <div>
                  <Label htmlFor="systemLocationId">System Location *</Label>
                  <select
                    id="systemLocationId"
                    value={formData.systemLocationId}
                    onChange={(e) => setFormData({ ...formData, systemLocationId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a location</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.locationName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSubmit}
                    loading={submitting} disabled={submitting}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {editingId ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCloseModal}
                    loading={submitting} disabled={submitting}
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
