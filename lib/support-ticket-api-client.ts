import { auth } from '@/lib/firebase';

export async function supportTicketPost(path: string, body: Record<string, unknown>) {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  const token = await u.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed');
  return data;
}
