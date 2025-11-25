'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { notifyAdminsOfLocation } from '@/lib/notifications';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { uploadMultipleToCloudinary } from '@/lib/cloudinary-upload';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function CreateLocation() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    companyId: '',
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    propertyType: 'Commercial',
    notes: '',
  });
  const [assignedCompany, setAssignedCompany] = useState<{ id: string; name: string } | null>(null);
  const [checkingCompany, setCheckingCompany] = useState(true);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);

      // Create preview URLs
      const urls = Array.from(files).map(file => URL.createObjectURL(file));
      setPreviewUrls(urls);
    }
  };

  // Load assigned company
  useEffect(() => {
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (isMounted) {
          setAssignedCompany(null);
          setFormData(prev => ({ ...prev, companyId: '' }));
          setCheckingCompany(false);
        }
        return;
      }

      // Get the client's companyId from their profile
      try {
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        if (!clientDoc.exists()) {
          if (isMounted) {
            setAssignedCompany(null);
            setFormData(prev => ({ ...prev, companyId: '' }));
          }
          return;
        }

        const clientData = clientDoc.data();
        const clientCompanyId = clientData.companyId;

        if (!clientCompanyId) {
          if (isMounted) {
            setAssignedCompany(null);
            setFormData(prev => ({ ...prev, companyId: '' }));
          }
          return;
        }

        const companyDoc = await getDoc(doc(db, 'companies', clientCompanyId));
        if (companyDoc.exists() && isMounted) {
          const data = companyDoc.data() as { name?: string };
          const companyInfo = {
            id: companyDoc.id,
            name: data.name || 'Unnamed Company',
          };
          setAssignedCompany(companyInfo);
          // Auto-select the company
          setFormData(prev => ({ ...prev, companyId: companyDoc.id }));
        } else if (isMounted) {
          setAssignedCompany(null);
          setFormData(prev => ({ ...prev, companyId: '' }));
        }
      } catch (error) {
        console.error('Error fetching companies for client portal', error);
        if (isMounted) {
          setAssignedCompany(null);
          setFormData(prev => ({ ...prev, companyId: '' }));
        }
      } finally {
        if (isMounted) {
          setCheckingCompany(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

  const removeImage = (index: number) => {
    if (selectedFiles) {
      const dt = new DataTransfer();
      const filesArray = Array.from(selectedFiles);
      filesArray.splice(index, 1);
      filesArray.forEach(file => dt.items.add(file));
      setSelectedFiles(dt.files);

      const newUrls = [...previewUrls];
      URL.revokeObjectURL(newUrls[index]);
      newUrls.splice(index, 1);
      setPreviewUrls(newUrls);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in');
        return;
      }

      // Get client details
      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      if (!clientDoc.exists()) {
        toast.error('Client profile not found');
        return;
      }

      const clientData = clientDoc.data();

      // Ensure has company
      if (!formData.companyId) {
        toast.error('Please select a Company first');
        setLoading(false);
        return;
      }

      const selectedCompany = assignedCompany;

      // Upload images if any
      let imageUrls: string[] = [];
      if (selectedFiles && selectedFiles.length > 0) {
        setUploadingImages(true);
        try {
          imageUrls = await uploadMultipleToCloudinary(selectedFiles);
        } catch (error) {
          console.error('Error uploading images:', error);
          toast.error('Failed to upload images. Please try again.');
          setUploadingImages(false);
          setLoading(false);
          return;
        }
        setUploadingImages(false);
      }

      // Create location with consistent structure for admin compatibility
      const locationRef = await addDoc(collection(db, 'locations'), {
        clientId: currentUser.uid,
        clientName: clientData.fullName || clientData.companyName || '',
        clientEmail: clientData.email || '',
        companyId: formData.companyId,
        companyName: selectedCompany?.name || '',
        locationName: formData.name,
        name: formData.name, // Keep for backward compatibility
        address: {
          street: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zipCode,
          country: 'USA',
        },
        // Also keep flat fields for backward compatibility
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        propertyType: formData.propertyType,
        contactPerson: '',
        contactPhone: '',
        notes: formData.notes || '',
        images: imageUrls,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Notify all admins
      await notifyAdminsOfLocation(locationRef.id, formData.name, clientData.fullName || clientData.companyName || 'Client');

      toast.success('Location created successfully! Awaiting admin approval.');
      router.push('/client-portal/locations');
    } catch (error) {
      console.error('Error creating location:', error);
      toast.error('Failed to create location');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <Link href="/client-portal/locations">
            <Button variant="outline" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Locations
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Add New Location</h1>
          <p className="text-gray-600 mt-2">Submit a new property location for approval</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Location Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Label htmlFor="companyId">Company *</Label>
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-between">
                    <span className="text-gray-900 font-medium">
                      {assignedCompany?.name || (checkingCompany ? 'Checking assignment…' : 'No company assigned')}
                    </span>
                    {assignedCompany && (
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Auto-selected</span>
                    )}
                  </div>
                  {!assignedCompany && !checkingCompany && (
                    <p className="text-sm text-red-500 mt-1">
                      No company assigned. Please contact an administrator to assign you to a company before creating locations.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="name">Location Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Main Office Building"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="propertyType">Property Type *</Label>
                  <select
                    id="propertyType"
                    name="propertyType"
                    value={formData.propertyType}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="Commercial">Commercial</option>
                    <option value="Residential">Residential</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Retail">Retail</option>
                    <option value="Office">Office</option>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="address">Street Address *</Label>
                  <Input
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="123 Main St"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="New York"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="NY"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="zipCode">ZIP Code *</Label>
                  <Input
                    id="zipCode"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleChange}
                    placeholder="10001"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Any additional information about this location..."
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="images">Property Images (Optional)</Label>
                  <div className="mt-2">
                    <label htmlFor="images" className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-md appearance-none cursor-pointer hover:border-blue-400 focus:outline-none">
                      <div className="flex flex-col items-center space-y-2">
                        <Upload className="h-8 w-8 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          Click to upload images
                        </span>
                      </div>
                      <input
                        id="images"
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {previewUrls.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {previewUrls.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <Link href="/client-portal/locations">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={loading || uploadingImages || !assignedCompany}>
                  {uploadingImages ? 'Uploading Images...' : loading ? 'Creating...' : 'Create Location'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
