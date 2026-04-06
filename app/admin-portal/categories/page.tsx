'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, orderBy, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag, Plus, Edit2, Save, X, Search, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

interface SystemNote {
  action: string;
  userId: string;
  userName: string;
  timestamp: string;
  details: string;
}

interface Category {
  id: string;
  name: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  createdByName?: string;
  creationSource?: string;
  systemNotes?: SystemNote[];
}

export default function CategoriesManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const [formData, setFormData] = useState({
    name: '',
  });

  const fetchCategories = async () => {
    try {
      const categoriesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
      const snapshot = await getDocs(categoriesQuery);
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Category[];
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (category: Category) => {
    setFormData({
      name: category.name,
    });
    setEditingId(category.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || formData.name.trim() === '') {
      toast.error('Please enter a category name');
      return;
    }

    // Check for duplicate names (excluding current editing item)
    const duplicate = categories.find(
      cat => cat.name.toLowerCase().trim() === formData.name.toLowerCase().trim() && cat.id !== editingId
    );
    if (duplicate) {
      toast.error('A category with this name already exists');
      return;
    }

    setSubmitting(true);

    try {
      const currentUser = auth.currentUser;
      const userName = currentUser?.displayName || currentUser?.email || 'Admin';
      const userId = currentUser?.uid || 'unknown';

      if (editingId) {
        // Update existing category
        await updateDoc(doc(db, 'categories', editingId), {
          name: formData.name.trim(),
          updatedAt: serverTimestamp(),
          systemNotes: arrayUnion({
            action: 'updated',
            userId,
            userName,
            timestamp: new Date().toISOString(),
            details: `Category name updated to "${formData.name.trim()}" via Admin Portal`,
          }),
        });

        toast.success('Category updated successfully');
      } else {
        // Create new category
        await addDoc(collection(db, 'categories'), {
          name: formData.name.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId,
          createdByName: userName,
          creationSource: 'admin_portal',
          systemNotes: [{
            action: 'created',
            userId,
            userName,
            timestamp: new Date().toISOString(),
            details: 'Category created via Admin Portal',
          }],
        });

        toast.success('Category created successfully');
      }

      resetForm();
      fetchCategories();
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error.message || 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;

    try {
      await deleteDoc(doc(db, 'categories', categoryToDelete.id));
      toast.success('Category deleted successfully');
      setShowDeleteModal(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  const filteredCategories = categories.filter(category => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery || category.name.toLowerCase().includes(searchLower);
  });

  return (
    <AdminLayout>
      <PageContainer>
        <PageHeader
          title="Categories"
          subtitle="Manage work order categories"
          icon={Tag}
          iconClassName="text-blue-600"
          action={
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Category
            </Button>
          }
        />

        <StatCards items={[{ label: 'Total', value: categories.length, icon: Tag, color: 'blue' }]} />

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredCategories.length === 0 ? (
          <EmptyState
            icon={Tag}
            title={searchQuery ? 'No categories found' : 'No categories yet'}
            subtitle={searchQuery ? 'Try adjusting your search' : 'Create your first category'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategories.map((category) => (
              <div key={category.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Category name */}
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className="h-4 w-4 text-blue-600 shrink-0" />
                  <p className="text-sm font-semibold text-foreground truncate">{category.name}</p>
                </div>
                {/* System info */}
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    <span>
                      Created by: {category.createdByName || 'Unknown'} via{' '}
                      <span className={`px-1 py-0.5 rounded text-[10px] font-semibold ${
                        category.creationSource === 'admin_portal' ? 'bg-blue-100 text-blue-700'
                        : category.creationSource === 'csv_import' ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-700'
                      }`}>
                        {category.creationSource === 'admin_portal' ? 'Admin Portal'
                        : category.creationSource === 'csv_import' ? 'CSV Import'
                        : 'Unknown'}
                      </span>
                    </span>
                  </div>
                  {category.createdAt && (
                    <div>
                      {(category.createdAt?.toDate ? category.createdAt.toDate() : new Date(category.createdAt)).toLocaleDateString()}
                    </div>
                  )}
                  {category.systemNotes && category.systemNotes.length > 1 && (
                    <div className="text-[10px] text-muted-foreground">
                      {category.systemNotes.length} change(s) recorded
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => handleOpenEdit(category)}>
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" title="Delete" onClick={() => handleDeleteCategory(category)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {editingId ? 'Edit Category' : 'Create New Category'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <Label>Category Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., HVAC, Plumbing, Electrical"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This category will be available in all work order forms
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    loading={submitting} disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    loading={submitting} disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && categoryToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Category</h2>
                <p className="text-foreground mb-4">
                  Are you sure you want to delete the category <strong>"{categoryToDelete.name}"</strong>?
                </p>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> This category will be removed from all work order forms.
                  </p>
                  <p className="text-sm text-yellow-800 mt-2 font-semibold">This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setCategoryToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDelete}
                    className="flex-1"
                  >
                    Delete Category
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

