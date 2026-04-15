// Completed jobs list with attached vendor-payment summary (read-only: baseAmount, finalAmount, status).
// NEVER show internalNotes or adjustment reasons — spec §15.7.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function CompletedJobs() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'assignedJobs'), where('subcontractorId', '==', user.uid)),
      async (snap) => {
        const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
        const completed = jobs.filter((j) => ['completed', 'pending_invoice'].includes(j.status));
        // Pull vendor payments in one go
        const vpSnap = await getDocs(query(collection(db, 'vendorPayments'), where('subcontractorId', '==', user.uid)));
        const vpByWO = new Map(vpSnap.docs.map((d) => {
          const data = d.data() as any;
          return [data.workOrderId, { id: d.id, ...data }];
        }));
        setRows(completed.map((j) => ({ job: j, vp: vpByWO.get(j.workOrderId) })));
      },
    );
    return () => unsub();
  }, [user]);

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Completed Jobs" />
      {rows.length === 0 ? <EmptyState title="No completed jobs yet" /> : (
        <FlashList
          data={rows}
          
          keyExtractor={(r) => r.job.id}
          renderItem={({ item }) => (
            <Card className="mb-2">
              <CardTitle>{item.job.workOrderNumber || item.job.workOrderId?.slice(0, 8)}</CardTitle>
              <Text className="text-xs text-muted-foreground mt-1">
                Completed {formatDate(item.job.completedAt || item.job.updatedAt)}
              </Text>
              {item.vp ? (
                <View className="mt-3 pt-3 border-t border-border">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-muted-foreground">Vendor Payment</Text>
                    <Badge status={item.vp.status} />
                  </View>
                  <Text className="text-xl font-bold text-foreground mt-1">{formatCurrency(item.vp.finalAmount)}</Text>
                  {item.vp.baseAmount !== item.vp.finalAmount ? (
                    <Text className="text-xs text-muted-foreground">Base {formatCurrency(item.vp.baseAmount)} · Adjusted</Text>
                  ) : null}
                </View>
              ) : (
                <Text className="text-xs text-muted-foreground mt-2">Vendor payment not yet created</Text>
              )}
            </Card>
          )}
        />
      )}
    </PageContainer>
  );
}
