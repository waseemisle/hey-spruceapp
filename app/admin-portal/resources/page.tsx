'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  collection, query, getDocs, doc, updateDoc,
  addDoc, serverTimestamp, deleteDoc, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, Plus, Edit2, Save, X, Search, Trash2, ExternalLink, FileText, Video, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'SOPs',                 emoji: '📋' },
  { name: 'Training Videos',      emoji: '🎥' },
  { name: 'Backorder Management', emoji: '📦' },
  { name: 'Quote Builder',        emoji: '💰' },
  { name: 'CRM & Sales',          emoji: '🤝' },
  { name: 'Production',           emoji: '🏭' },
  { name: 'Customer Service',     emoji: '💬' },
  { name: 'Purchasing',           emoji: '🛒' },
  { name: 'Onboarding',           emoji: '👋' },
  { name: 'Policies',             emoji: '📜' },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resource {
  id: string;
  title: string;
  description: string;
  category: string;
  videoUrl?: string;
  pdfUrl?: string;
  tags: string[];
  createdAt?: any;
  updatedAt?: any;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: '',
  videoUrl: '',
  pdfUrl: '',
  tags: '',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResourcesPage() {
  const [resources, setResources]               = useState<Resource[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [searchQuery, setSearchQuery]           = useState('');
  const [filterCategory, setFilterCategory]     = useState('');

  const [showModal, setShowModal]               = useState(false);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);

  const [formData, setFormData]                 = useState(EMPTY_FORM);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchResources = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'resources'), orderBy('createdAt', 'desc')));
      setResources(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Resource[]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResources(); }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return resources.filter(r => {
      const matchSearch =
        !q ||
        r.title.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.tags ?? []).some(t => t.toLowerCase().includes(q));
      const matchCat = !filterCategory || r.category === filterCategory;
      return matchSearch && matchCat;
    });
  }, [resources, searchQuery, filterCategory]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of CATEGORIES) map[cat.name] = 0;
    for (const r of resources) {
      if (r.category in map) map[r.category]++;
    }
    return map;
  }, [resources]);

  const withVideo      = resources.filter(r => r.videoUrl).length;
  const withPdf        = resources.filter(r => r.pdfUrl).length;
  const usedCategories = new Set(resources.map(r => r.category).filter(Boolean)).size;

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setShowModal(true);
  };

  const handleOpenEdit = (r: Resource) => {
    setFormData({
      title:       r.title,
      description: r.description ?? '',
      category:    r.category,
      videoUrl:    r.videoUrl ?? '',
      pdfUrl:      r.pdfUrl ?? '',
      tags:        (r.tags ?? []).join(', '),
    });
    setEditingId(r.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title:       formData.title.trim(),
        description: formData.description.trim(),
        category:    formData.category,
        videoUrl:    formData.videoUrl.trim() || null,
        pdfUrl:      formData.pdfUrl.trim() || null,
        tags:        formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        updatedAt:   serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'resources', editingId), payload);
        toast.success('Resource updated');
      } else {
        await addDoc(collection(db, 'resources'), { ...payload, createdAt: serverTimestamp() });
        toast.success('Resource created');
      }
      resetForm();
      fetchResources();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save resource');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!resourceToDelete) return;
    try {
      await deleteDoc(doc(db, 'resources', resourceToDelete.id));
      toast.success('Resource deleted');
      setShowDeleteModal(false);
      setResourceToDelete(null);
      fetchResources();
    } catch {
      toast.error('Failed to delete resource');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <PageContainer>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <PageHeader
          title="Resources & Knowledge Base"
          subtitle="SOPs, training videos, and internal documentation"
          icon={BookOpen}
          iconClassName="text-blue-600"
          action={
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Resource
            </Button>
          }
        />

        {/* ── Stat Cards ────────────────────────────────────────────────────── */}
        <StatCards items={[
          { label: 'Total Resources',   value: resources.length, icon: BookOpen, color: 'blue'    },
          { label: 'Categories in Use', value: usedCategories,   icon: Tag,      color: 'purple'  },
          { label: 'With Video',        value: withVideo,        icon: Video,    color: 'emerald' },
          { label: 'With PDF',          value: withPdf,          icon: FileText, color: 'amber'   },
        ]} />

        {/* ── Browse by Category ────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            📁 Browse by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {CATEGORIES.map(cat => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setFilterCategory(filterCategory === cat.name ? '' : cat.name)}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border text-center transition-all hover:shadow-md ${
                  filterCategory === cat.name
                    ? 'border-blue-400 bg-blue-50 shadow-sm dark:bg-blue-950/30'
                    : 'border-border bg-card hover:border-blue-200'
                }`}
              >
                <span className="text-2xl leading-none">{cat.emoji}</span>
                <span className="text-xs font-semibold text-foreground leading-tight">{cat.name}</span>
                <span className="text-xs text-muted-foreground">
                  {categoryCounts[cat.name] ?? 0} {categoryCounts[cat.name] === 1 ? 'resource' : 'resources'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Search + Filters ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search resources..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
            ))}
          </select>
          {(searchQuery || filterCategory) && (
            <Button
              variant="outline"
              className="gap-2 text-muted-foreground"
              onClick={() => { setSearchQuery(''); setFilterCategory(''); }}
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* ── Resource Grid ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading resources...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={searchQuery || filterCategory ? 'No resources match your filters' : 'No resources yet'}
            subtitle={
              searchQuery || filterCategory
                ? 'Try adjusting your search or clearing filters'
                : 'Click "Add Resource" to create your first resource'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(r => {
              const cat = CATEGORIES.find(c => c.name === r.category);
              return (
                <div
                  key={r.id}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  {/* Category + type badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {cat ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/40 px-2.5 py-0.5 rounded-full">
                        <span>{cat.emoji}</span> {cat.name}
                      </span>
                    ) : r.category ? (
                      <span className="text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">{r.category}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">Uncategorised</span>
                    )}
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">📄 Document</span>
                  </div>

                  {/* Title + description */}
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground leading-snug">{r.title}</p>
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    )}
                  </div>

                  {/* Tags */}
                  {r.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map(tag => (
                        <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Attachment links */}
                  {(r.videoUrl || r.pdfUrl) && (
                    <div className="flex flex-wrap gap-2">
                      {r.videoUrl && (
                        <a
                          href={r.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-full hover:bg-purple-100 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/40 transition-colors"
                        >
                          🎥 Watch Video <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {r.pdfUrl && (
                        <a
                          href={r.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40 transition-colors"
                        >
                          📄 View PDF <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                    <Button
                      size="sm" variant="outline"
                      className="flex-1 h-8 text-xs gap-1"
                      onClick={() => handleOpenEdit(r)}
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                      title="Delete"
                      onClick={() => { setResourceToDelete(r); setShowDeleteModal(true); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="p-6 border-b bg-card rounded-t-2xl shrink-0">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">
                    {editingId ? 'Edit Resource' : '➕ Add New Resource'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="p-6 space-y-5 overflow-y-auto">

                {/* Title */}
                <div>
                  <Label>Title *</Label>
                  <Input
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Backorder Management SOP"
                    autoFocus
                    className="mt-1"
                  />
                </div>

                {/* Description */}
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this resource..."
                    rows={2}
                    className="mt-1"
                  />
                </div>

                {/* Category */}
                <div>
                  <Label>Category</Label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select category...</option>
                    {CATEGORIES.map(c => (
                      <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Type */}
                <div>
                  <Label>Type *</Label>
                  <div className="mt-1">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-sm font-medium">
                      📄 Document
                    </div>
                  </div>
                </div>

                {/* Attach Resources */}
                <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-4">
                  <p className="text-sm font-semibold text-foreground">
                    📎 Attach Resources{' '}
                    <span className="font-normal text-muted-foreground text-xs">
                      (optional — add video AND/OR PDF)
                    </span>
                  </p>

                  {/* Video URL */}
                  <div>
                    <Label className="text-xs text-muted-foreground">🎥 Video URL (Loom or YouTube)</Label>
                    <Input
                      value={formData.videoUrl}
                      onChange={e => setFormData({ ...formData, videoUrl: e.target.value })}
                      placeholder="https://www.loom.com/share/... or https://youtube.com/watch?v=..."
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Paste Loom or YouTube link</p>
                  </div>

                  {/* PDF URL */}
                  <div>
                    <Label className="text-xs text-muted-foreground">📄 PDF URL (Google Drive or direct link)</Label>
                    <Input
                      value={formData.pdfUrl}
                      onChange={e => setFormData({ ...formData, pdfUrl: e.target.value })}
                      placeholder="https://drive.google.com/file/d/.../view or https://example.com/doc.pdf"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Paste Google Drive share link (recommended) or direct PDF URL
                    </p>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <Label>
                    Tags{' '}
                    <span className="font-normal text-muted-foreground text-xs">(comma-separated)</span>
                  </Label>
                  <Input
                    value={formData.tags}
                    onChange={e => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="backorder, sop, training"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Footer buttons */}
              <div className="p-6 border-t shrink-0">
                <div className="flex gap-3">
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSubmit}
                    loading={submitting}
                    disabled={submitting}
                  >
                    <Save className="h-4 w-4" />
                    {submitting ? 'Saving...' : editingId ? 'Update Resource' : '✅ Create Resource'}
                  </Button>
                  <Button variant="outline" onClick={resetForm} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
        {showDeleteModal && resourceToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">Delete Resource</h2>
                <p className="text-foreground mb-4">
                  Are you sure you want to delete{' '}
                  <strong>"{resourceToDelete.title}"</strong>?
                </p>
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">
                    This action cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowDeleteModal(false); setResourceToDelete(null); }}
                  >
                    Cancel
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={confirmDelete}>
                    Delete Resource
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

      </PageContainer>
    </AdminLayout>
  );
}
