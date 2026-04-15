import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Image, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { toast } from 'sonner-native';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { Camera, Image as ImageIcon, X } from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FilterPills } from '@/components/ui/FilterPills';
import { compressImage } from '@/lib/client-image-compress';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import { createWorkOrderTimelineEvent } from '@/lib/timeline';
import { api } from '@/lib/api';

type Priority = 'low' | 'medium' | 'high';

export default function CreateWorkOrder() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [images, setImages] = useState<string[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'locations'), where('clientId', '==', user.uid))).then((snap) => {
      setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  const pickImage = async (fromCamera: boolean) => {
    const perms = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perms.granted) { Alert.alert('Permission required'); return; }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!res.canceled && res.assets[0]) {
      const compressed = await compressImage(res.assets[0].uri);
      setImages((p) => [...p, compressed]);
    }
  };

  const submit = async () => {
    if (!title || !description || !locationId) {
      Alert.alert('Missing fields', 'Title, description, and location are required.');
      return;
    }
    setSubmitting(true);
    try {
      const urls: string[] = [];
      for (const uri of images) urls.push(await uploadToCloudinary(uri));
      const loc = locations.find((l) => l.id === locationId);
      const woNum = `WO-${Date.now().toString(36).toUpperCase().slice(-8)}`;

      const timelineEvent = createWorkOrderTimelineEvent({
        type: 'created',
        userId: user!.uid,
        userName: userProfile?.fullName || 'Client',
        userRole: 'client',
        details: 'Work order created by client',
      });

      const docRef = await addDoc(collection(db, 'workOrders'), {
        workOrderNumber: woNum,
        clientId: user!.uid,
        clientName: userProfile?.fullName || '',
        clientEmail: userProfile?.email || '',
        companyId: userProfile?.companyId || null,
        locationId,
        location: loc,
        title,
        description,
        category: 'general',
        categoryId: '',
        priority,
        status: 'pending',
        images: urls,
        timeline: [timelineEvent],
        systemInformation: {
          createdBy: { id: user!.uid, name: userProfile?.fullName || '', role: 'client', timestamp: new Date() },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Fire-and-forget email notification to admin.
      api.post('/api/email/send-work-order-notification', {
        workOrderId: docRef.id,
        workOrderNumber: woNum,
        title,
        clientName: userProfile?.fullName,
      }).catch(() => {});

      toast.success('Work order created');
      router.replace(`/(client)/work-orders/${docRef.id}` as any);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="New Service Request" />
      <Text className="text-sm font-semibold text-foreground mb-1">Location *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        {locations.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => setLocationId(l.id)}
            className={`px-3 py-2 rounded-full mr-2 ${locationId === l.id ? 'bg-navy' : 'bg-secondary'}`}
          >
            <Text className={`text-xs font-semibold ${locationId === l.id ? 'text-white' : 'text-secondary-foreground'}`}>
              {l.locationName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Input label="Title *" value={title} onChangeText={setTitle} />
      <Textarea label="Description *" value={description} onChangeText={setDescription} />

      <Text className="text-sm font-semibold text-foreground mb-1">Priority</Text>
      <FilterPills<Priority>
        value={priority}
        onChange={setPriority}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ]}
      />

      <Text className="text-sm font-semibold text-foreground mb-2">Photos</Text>
      <View className="flex-row flex-wrap mb-3">
        {images.map((uri, i) => (
          <View key={i} className="w-20 h-20 mr-2 mb-2 relative">
            <Image source={{ uri }} className="w-20 h-20 rounded" />
            <Pressable
              onPress={() => setImages((p) => p.filter((_, idx) => idx !== i))}
              className="absolute -top-1 -right-1 bg-destructive rounded-full w-5 h-5 items-center justify-center"
            >
              <X size={12} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => pickImage(true)} className="w-20 h-20 mr-2 bg-secondary rounded items-center justify-center">
          <Camera size={22} color="#1A2635" />
        </Pressable>
        <Pressable onPress={() => pickImage(false)} className="w-20 h-20 bg-secondary rounded items-center justify-center">
          <ImageIcon size={22} color="#1A2635" />
        </Pressable>
      </View>

      <Button onPress={submit} loading={submitting}>Submit</Button>
    </PageContainer>
  );
}
