// Assigned jobs — accept/reject (writes `status, acceptedAt|rejectedAt` diff only per Firestore rules)
// then mark complete (writes `status, completedAt, completionNotes, completionImages` diff only).
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Modal, Image, Pressable, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import {
  collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, arrayUnion, getDoc,
} from 'firebase/firestore';
import { Camera, X } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { compressImage } from '@/lib/client-image-compress';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import { createWorkOrderTimelineEvent } from '@/lib/timeline';
import { formatDate } from '@/lib/utils';

export default function Assigned() {
  const { user, userProfile } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [wo, setWo] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'assignedJobs'), where('subcontractorId', '==', user.uid)),
      (s) => setJobs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, [user]);

  const open = async (job: any) => {
    setActive(job);
    if (job.workOrderId) {
      const snap = await getDoc(doc(db, 'workOrders', job.workOrderId));
      if (snap.exists()) setWo({ id: snap.id, ...snap.data() });
    }
  };

  const decide = async (accept: boolean) => {
    if (!active) return;
    try {
      await updateDoc(doc(db, 'assignedJobs', active.id), {
        status: accept ? 'accepted' : 'rejected',
        ...(accept ? { acceptedAt: serverTimestamp() } : { rejectedAt: serverTimestamp() }),
      });
      toast.success(accept ? 'Job accepted' : 'Job rejected');
      setActive(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Assigned Jobs" />
      {jobs.length === 0 ? <EmptyState title="No active jobs" /> : (
        <FlashList
          data={jobs}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card onPress={() => open(item)} className="mb-2">
              <View className="flex-row items-center justify-between">
                <CardTitle>{item.workOrderNumber || item.workOrderId?.slice(0, 8)}</CardTitle>
                <Badge status={item.status} />
              </View>
              {item.scheduledServiceDate ? (
                <Text className="text-xs text-muted-foreground mt-1">
                  Scheduled {formatDate(item.scheduledServiceDate)} {item.scheduledServiceTime}
                </Text>
              ) : null}
            </Card>
          )}
        />
      )}
      {active ? <JobSheet job={active} wo={wo} onClose={() => { setActive(null); setWo(null); }} decide={decide} user={user} userProfile={userProfile} /> : null}
    </PageContainer>
  );
}

function JobSheet({ job, wo, onClose, decide, user, userProfile }: any) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!r.canceled && r.assets[0]) {
      const compressed = await compressImage(r.assets[0].uri);
      setPhotos((x) => [...x, compressed]);
    }
  };

  const complete = async () => {
    if (!notes || photos.length === 0) {
      Alert.alert('Required', 'Completion notes and at least one photo are required.');
      return;
    }
    setLoading(true);
    try {
      const urls: string[] = [];
      for (const u of photos) urls.push(await uploadToCloudinary(u));
      const ev = createWorkOrderTimelineEvent({
        type: 'completed',
        userId: user.uid,
        userName: userProfile?.fullName || 'Subcontractor',
        userRole: 'subcontractor',
        details: 'Work completed by subcontractor',
      });
      // Only mutate allowed fields (status, completedAt, completionNotes, completionImages, timeline, updatedAt)
      await updateDoc(doc(db, 'workOrders', job.workOrderId), {
        status: 'completed',
        completedAt: serverTimestamp(),
        completionNotes: notes,
        completionImages: urls,
        timeline: arrayUnion(ev),
        updatedAt: serverTimestamp(),
      });
      toast.success('Marked complete');
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <PageContainer>
        <PageHeader title={wo?.title || 'Job'} subtitle={wo?.workOrderNumber} actions={<Button size="sm" variant="ghost" onPress={onClose}>Close</Button>} />
        {wo ? (
          <Card className="mb-3">
            <Text className="text-sm">{wo.description}</Text>
            <Text className="text-xs text-muted-foreground mt-2">{wo.location?.locationName}</Text>
          </Card>
        ) : null}

        {job.status === 'pending' ? (
          <View className="flex-row gap-2">
            <View className="flex-1"><Button onPress={() => decide(true)}>Accept</Button></View>
            <View className="flex-1"><Button variant="destructive" onPress={() => decide(false)}>Reject</Button></View>
          </View>
        ) : job.status === 'accepted' ? (
          <>
            <Textarea label="Completion notes" value={notes} onChangeText={setNotes} />
            <Text className="text-sm font-semibold mb-2">Completion photos</Text>
            <ScrollView horizontal className="mb-3">
              {photos.map((uri, i) => (
                <View key={i} className="relative mr-2">
                  <Image source={{ uri }} className="w-20 h-20 rounded" />
                  <Pressable
                    onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 bg-destructive rounded-full w-5 h-5 items-center justify-center"
                  >
                    <X size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={pick} className="w-20 h-20 bg-secondary rounded items-center justify-center">
                <Camera size={22} color="#1A2635" />
              </Pressable>
            </ScrollView>
            <Button onPress={complete} loading={loading}>Mark Complete</Button>
          </>
        ) : (
          <Text className="text-center text-muted-foreground">This job is {job.status}.</Text>
        )}
      </PageContainer>
    </Modal>
  );
}
