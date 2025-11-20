'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs, updateDoc, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { uploadMultipleToCloudinary } from '@/lib/cloudinary-upload';
import { notifyAdminsOfWorkOrder } from '@/lib/notifications';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Location {
  id: string;
  name: string;
  address: string | { street: string; city: string; state: string; zip: string; country: string; };
}

interface Category {
  id: string;
  name: string;
}

export default function CreateWorkOrder() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [companyInfo, setCompanyInfo] = useState<{ id: string; name?: string } | null>(null);
  const [checkingCompany, setCheckingCompany] = useState(true);

  const [formData, setFormData] = useState({
    locationId: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    estimateBudget: '',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCompanyInfo(null);
        setLocations([]);
        setCheckingCompany(false);
        return;
      }

      setCheckingCompany(true);
      try {
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        if (!clientDoc.exists()) {
          setCompanyInfo(null);
          setLocations([]);
          return;
        }

        const clientData = clientDoc.data();
        if (!clientData.companyId) {
          setCompanyInfo(null);
          setLocations([]);
          return;
        }

        const companyId = clientData.companyId as string;
        try {
          const companyDoc = await getDoc(doc(db, 'companies', companyId));
          if (companyDoc.exists()) {
            const data = companyDoc.data() as { name?: string };
            setCompanyInfo({ id: companyDoc.id, name: data.name || 'Assigned Company' });
          } else {
            setCompanyInfo({ id: companyId, name: 'Assigned Company' });
          }
        } catch {
          setCompanyInfo({ id: companyId, name: 'Assigned Company' });
        }

        const locationsQuery = query(
          collection(db, 'locations'),
          where('companyId', '==', companyId),
          where('status', '==', 'approved')
        );

        const snapshot = await getDocs(locationsQuery);
        const locationsData = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          name: docSnap.data().locationName || docSnap.data().name,
          address: docSnap.data().address,
        }));

        setLocations(locationsData);
      } catch (error) {
        console.error('Error fetching locations for work order', error);
        setCompanyInfo(null);
        setLocations([]);
      } finally {
        setCheckingCompany(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const categoriesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
        const snapshot = await getDocs(categoriesQuery);
        const categoriesData = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
        })) as Category[];
        setCategories(categoriesData);
        // Set default category to first one if available and no category is set
        setFormData(prev => {
          if (categoriesData.length > 0 && !prev.category) {
            return { ...prev, category: categoriesData[0].name };
          }
          return prev;
        });
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };

    fetchCategories();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      const urls = Array.from(files).map(file => URL.createObjectURL(file));
      setPreviewUrls(urls);
    }
  };

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

      // Validate that at least one image is uploaded
      if (!selectedFiles || selectedFiles.length === 0) {
        toast.error('Please upload at least one image');
        setLoading(false);
        return;
      }

      // Get client and location details
      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      const locationDoc = await getDoc(doc(db, 'locations', formData.locationId));

      if (!clientDoc.exists() || !locationDoc.exists()) {
        toast.error('Invalid client or location');
        return;
      }

      const clientData = clientDoc.data();
      if (!clientData.companyId) {
        toast.error('No company is assigned to your profile. Please contact an administrator.');
        setLoading(false);
        return;
      }

      const locationData = locationDoc.data();
      if (locationData.companyId !== clientData.companyId) {
        toast.error('You do not have access to the selected location.');
        setLoading(false);
        return;
      }

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

      // Build full location address - handle both object and string formats
      let fullAddress = 'N/A';
      if (locationData.address) {
        if (typeof locationData.address === 'object') {
          // Address is an object
          const parts: string[] = [];
          if (locationData.address.street) parts.push(locationData.address.street);
          if (locationData.address.city) parts.push(locationData.address.city);
          if (locationData.address.state) parts.push(locationData.address.state);
          if (locationData.address.zip || locationData.address.zipCode) parts.push(locationData.address.zip || locationData.address.zipCode);
          fullAddress = parts.filter(p => p).join(', ');
        } else {
          // Address is a string, but we might have city/state separately
          const parts: string[] = [locationData.address];
          if (locationData.city) parts.push(locationData.city);
          if (locationData.state) parts.push(locationData.state);
          if (locationData.zipCode) parts.push(locationData.zipCode);
          fullAddress = parts.filter(p => p).join(', ');
        }
      } else if (locationData.city || locationData.state) {
        // No address field but has city/state
        const parts: string[] = [];
        if (locationData.city) parts.push(locationData.city);
        if (locationData.state) parts.push(locationData.state);
        if (locationData.zipCode) parts.push(locationData.zipCode);
        fullAddress = parts.filter(p => p).join(', ');
      }
      fullAddress = fullAddress.trim() || 'N/A';

      // Create work order
      const workOrderRef = await addDoc(collection(db, 'workOrders'), {
        clientId: currentUser.uid,
        clientName: clientData.fullName || clientData.companyName || '',
        clientEmail: clientData.email || '',
        locationId: formData.locationId,
        locationName: locationData.locationName || locationData.name || 'Unnamed Location',
        locationAddress: fullAddress,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        images: imageUrls,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Generate work order number
      const workOrderNumber = `WO-${workOrderRef.id.slice(-8).toUpperCase()}`;
      await updateDoc(workOrderRef, {
        workOrderNumber,
      });

      // Notify all admins
      await notifyAdminsOfWorkOrder(workOrderRef.id, workOrderNumber, clientData.fullName || clientData.companyName || 'Client');

      toast.success('Work order created successfully! Awaiting admin approval.');
      router.push('/client-portal/work-orders');
    } catch (error) {
      console.error('Error creating work order:', error);
      toast.error('Failed to create work order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <Link href="/client-portal/work-orders">
            <Button variant="outline" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Work Orders
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create Work Order</h1>
          <p className="text-gray-600 mt-2">Submit a new maintenance request</p>
        </div>

        {checkingCompany ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-600">Checking your company access…</div>
            </CardContent>
          </Card>
        ) : !companyInfo ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-red-600">
                  No company is assigned to your profile yet. Please contact an administrator for access before creating work orders.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : locations.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  You need at least one approved location before creating a work order.
                </p>
                <Link href="/client-portal/locations/create">
                  <Button disabled={!companyInfo}>Create Location First</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Work Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="locationId">Location *</Label>
                    <select
                      id="locationId"
                      name="locationId"
                      value={formData.locationId}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={checkingCompany}
                      required
                    >
                      <option value="">Select a location</option>
                      {locations.map(location => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <select
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select category...</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="priority">Priority *</Label>
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="low">Low - Can wait</option>
                      <option value="medium">Medium - Normal timeline</option>
                      <option value="high">High - Urgent attention needed</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      placeholder="e.g., AC Unit Not Cooling"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="description">Description *</Label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Provide detailed information about the issue..."
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="estimateBudget">Estimate Budget (Optional)</Label>
                    <Input
                      id="estimateBudget"
                      name="estimateBudget"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={formData.estimateBudget}
                      onChange={handleChange}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="e.g., 5000"
                    />
                    <p className="text-xs text-gray-500 mt-1">Estimated budget for this work order in USD</p>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="images">Images *</Label>
                    <div className="mt-2">
                      <label htmlFor="images" className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-md appearance-none cursor-pointer hover:border-blue-400 focus:outline-none">
                        <div className="flex flex-col items-center space-y-2">
                          <Upload className="h-8 w-8 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            Click to upload images (required)
                          </span>
                        </div>
                        <input
                          id="images"
                          name="images"
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
                  <Link href="/client-portal/work-orders">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={loading || uploadingImages || checkingCompany}>
                    {uploadingImages ? 'Uploading Images...' : loading ? 'Creating...' : 'Create Work Order'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
}
