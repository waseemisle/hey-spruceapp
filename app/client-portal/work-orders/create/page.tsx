'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs } from 'firebase/firestore';
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

interface Location {
  id: string;
  name: string;
  address: string | { street: string; city: string; state: string; zip: string; country: string; };
}

export default function CreateWorkOrder() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    locationId: '',
    title: '',
    description: '',
    category: 'HVAC',
    priority: 'medium',
    estimateBudget: '',
  });

  useEffect(() => {
    const fetchLocations = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const locationsQuery = query(
        collection(db, 'locations'),
        where('clientId', '==', currentUser.uid),
        where('status', '==', 'approved')
      );

      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        address: doc.data().address,
      }));

      setLocations(locationsData);
    };

    fetchLocations();
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

      // Get client and location details
      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      const locationDoc = await getDoc(doc(db, 'locations', formData.locationId));

      if (!clientDoc.exists() || !locationDoc.exists()) {
        toast.error('Invalid client or location');
        return;
      }

      const clientData = clientDoc.data();
      const locationData = locationDoc.data();

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

      // Build full location address
      const fullAddress = `${locationData.address || ''}, ${locationData.city || ''}, ${locationData.state || ''} ${locationData.zipCode || ''}`.trim();

      // Create work order
      await addDoc(collection(db, 'workOrders'), {
        clientId: currentUser.uid,
        clientName: clientData.fullName || clientData.companyName || '',
        clientEmail: clientData.email || '',
        locationId: formData.locationId,
        locationName: locationData.name || 'Unnamed Location',
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

        {locations.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  You need at least one approved location before creating a work order.
                </p>
                <Link href="/client-portal/locations/create">
                  <Button>Create Location First</Button>
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
                      required
                    >
                      <option value="">Select a location</option>
                      {locations.map(location => (
                        <option key={location.id} value={location.id}>
                          {location.name} - {typeof location.address === 'object' ? location.address.street : location.address}
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
                      <option value="HVAC">HVAC</option>
                      <option value="Plumbing">Plumbing</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Roofing">Roofing</option>
                      <option value="Flooring">Flooring</option>
                      <option value="Painting">Painting</option>
                      <option value="Landscaping">Landscaping</option>
                      <option value="Cleaning">Cleaning</option>
                      <option value="Security">Security</option>
                      <option value="General Maintenance">General Maintenance</option>
                      <option value="Other">Other</option>
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
                      value={formData.estimateBudget}
                      onChange={handleChange}
                      placeholder="e.g., 5000"
                    />
                    <p className="text-xs text-gray-500 mt-1">Estimated budget for this work order in USD</p>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="images">Images (Optional)</Label>
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
                  <Link href="/client-portal/work-orders">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={loading || uploadingImages}>
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
