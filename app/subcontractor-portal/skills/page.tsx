'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Modal from '@/components/ui/modal'
import { useAuth } from '@/lib/auth'
import { Subcontractor } from '@/lib/types'
import { useNotifications, NotificationContainer } from '@/components/ui/notification'
import { 
  Plus, 
  Search, 
  Settings, 
  Edit,
  Trash2,
  CheckCircle,
  XCircle
} from 'lucide-react'

export default function SubcontractorSkillsPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { notifications, removeNotification, success, error } = useNotifications()
  
  const [subcontractor, setSubcontractor] = useState<Subcontractor | null>(null)
  const [skills, setSkills] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState('')
  const [editingSkill, setEditingSkill] = useState<string | null>(null)
  const [editingSkillValue, setEditingSkillValue] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.uid) {
      fetchSubcontractorData()
    }
  }, [user?.uid])

  const fetchSubcontractorData = async () => {
    if (!user?.uid) {
      console.log('No user ID available')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/subcontractor/profile?userId=${user.uid}`)
      if (response.ok) {
        const data = await response.json()
        setSubcontractor(data)
        setSkills(data.skills || [])
      } else {
        error('Fetch Error', 'Failed to load subcontractor data')
      }
    } catch (err) {
      error('Fetch Error', 'Error loading subcontractor data')
    } finally {
      setLoading(false)
    }
  }

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newSkill.trim()) {
      error('Validation Error', 'Please enter a skill name')
      return
    }

    if (skills.some(skill => skill.toLowerCase() === newSkill.toLowerCase())) {
      error('Validation Error', 'This skill already exists')
      return
    }

    try {
      const updatedSkills = [...skills, newSkill.trim()]
      
      const response = await fetch(`/api/subcontractor/skills`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid,
          skills: updatedSkills
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add skill')
      }

      setSkills(updatedSkills)
      setNewSkill('')
      success('Skill Added', 'Skill added successfully!')
    } catch (err: any) {
      error('Add Failed', err.message)
    }
  }

  const handleEditSkill = (skill: string) => {
    setEditingSkill(skill)
    setEditingSkillValue(skill)
  }

  const handleSaveEdit = async () => {
    if (!editingSkill || !editingSkillValue.trim()) {
      error('Validation Error', 'Please enter a valid skill name')
      return
    }

    if (editingSkillValue.toLowerCase() !== editingSkill.toLowerCase() && 
        skills.some(skill => skill.toLowerCase() === editingSkillValue.toLowerCase())) {
      error('Validation Error', 'This skill already exists')
      return
    }

    try {
      const updatedSkills = skills.map(skill => 
        skill === editingSkill ? editingSkillValue.trim() : skill
      )
      
      const response = await fetch(`/api/subcontractor/skills`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid,
          skills: updatedSkills
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update skill')
      }

      setSkills(updatedSkills)
      setEditingSkill(null)
      setEditingSkillValue('')
      success('Skill Updated', 'Skill updated successfully!')
    } catch (err: any) {
      error('Update Failed', err.message)
    }
  }

  const handleDeleteSkill = async (skillToDelete: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) {
      return
    }

    try {
      const updatedSkills = skills.filter(skill => skill !== skillToDelete)
      
      const response = await fetch(`/api/subcontractor/skills`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid,
          skills: updatedSkills
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete skill')
      }

      setSkills(updatedSkills)
      success('Skill Deleted', 'Skill deleted successfully!')
    } catch (err: any) {
      error('Delete Failed', err.message)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading skills...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Skills Management</h1>
          <p className="text-gray-600">Manage your professional skills and expertise</p>
        </div>

        {/* Add New Skill */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add New Skill</CardTitle>
            <CardDescription>Add skills that showcase your expertise</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddSkill} className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="newSkill">Skill Name</Label>
                <Input
                  id="newSkill"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="e.g., HVAC Repair, Plumbing Installation, Electrical Wiring"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Skill
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Current Skills */}
        <Card>
          <CardHeader>
            <CardTitle>Current Skills</CardTitle>
            <CardDescription>Your professional skills and areas of expertise</CardDescription>
          </CardHeader>
          <CardContent>
            {skills.length === 0 ? (
              <div className="text-center py-8">
                <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No skills added yet</h3>
                <p className="text-gray-600 mb-4">Add your first skill to showcase your expertise</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill, index) => (
                  <div key={index} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      {editingSkill === skill ? (
                        <div className="flex-1 flex gap-2">
                          <Input
                            value={editingSkillValue}
                            onChange={(e) => setEditingSkillValue(e.target.value)}
                            className="flex-1"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit()
                              } else if (e.key === 'Escape') {
                                setEditingSkill(null)
                                setEditingSkillValue('')
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingSkill(null)
                              setEditingSkillValue('')
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium">{skill}</span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditSkill(skill)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteSkill(skill)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Skills Info */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">About Skills</h4>
                <p className="text-sm text-blue-700">
                  Your skills help admin match you with relevant work orders. Be specific about your areas of expertise 
                  to increase your chances of being selected for projects.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
