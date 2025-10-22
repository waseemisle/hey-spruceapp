'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, getDocs } from 'firebase/firestore';
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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    subsidiaryId: '',
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    propertyType: 'Commercial',
    notes: '',
  });
  const [subsidiaries, setSubsidiaries] = useState<{ id: string; name: string }[]>([]);

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

  // Load subsidiaries for current client
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const subsQuery = query(
          collection(db, 'subsidiaries'),
          where('clientId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(subsQuery);
        const data = snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name as string }));
        setSubsidiaries(data);
      }
    });
    return () => unsubscribeAuth();
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

      // Ensure has subsidiary
      if (!formData.subsidiaryId) {
        toast.error('Please select a Subsidiary first');
        setLoading(false);
        return;
      }

      const selectedSubsidiary = subsidiaries.find(s => s.id === formData.subsidiaryId);

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
      await addDoc(collection(db, 'locations'), {
        clientId: currentUser.uid,
        clientName: clientData.fullName || clientData.companyName || '',
        clientEmail: clientData.email || '',
        subsidiaryId: formData.subsidiaryId,
        subsidiaryName: selectedSubsidiary?.name || '',
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
                  <Label htmlFor="subsidiaryId">Subsidiary *</Label>
                  <select
                    id="subsidiaryId"
                    name="subsidiaryId"
                    value={formData.subsidiaryId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a subsidiary...</option>
                    {subsidiaries.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {subsidiaries.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      You must create a Subsidiary first.
                      <Link href="/client-portal/subsidiaries/create" className="text-blue-600 underline ml-1">Create one</Link>
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
                <Button type="submit" disabled={loading || uploadingImages || subsidiaries.length === 0}>
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
