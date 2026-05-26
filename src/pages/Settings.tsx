import { useState, useEffect } from 'react'
import {
  useAppSettings, useUpdateAppSettings,
  useBudgetCategories, useAddBudgetCategory, useDeleteBudgetCategory,
} from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'

const CURRENCIES = ['USD', 'IDR', 'EUR', 'GBP', 'JPY']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const VIEWS = ['Dashboard','Transactions','Budget','Investing','Estimation','Reports']
const NOTIF_OPTIONS = ['Weekly digest','Daily summary','None']

export function Settings() {
  const { data: settings } = useAppSettings()
  const updateSettings = useUpdateAppSettings()
  const { data: categories = [] } = useBudgetCategories()
  const addCategory = useAddBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()

  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [yearStart, setYearStart] = useState('January')
  const [defaultView, setDefaultView] = useState('Dashboard')
  const [notifications, setNotifications] = useState('Weekly digest')
  const [newCatName, setNewCatName] = useState('')

  useEffect(() => {
    if (!settings) return
    setName(settings.user_name)
    setEmail(settings.email)
    setCurrency(settings.currency)
    setYearStart(settings.year_start)
    setDefaultView(settings.default_view)
    setNotifications(settings.notifications)
  }, [settings])

  const saveProfile = async () => {
    if (!settings) return
    await updateSettings.mutateAsync({ id: settings.id, user_name: name, email })
    setEditMode(false)
    toast.success('Profile updated')
  }

  const savePreferences = async () => {
    if (!settings) return
    await updateSettings.mutateAsync({
      id: settings.id,
      currency, year_start: yearStart, default_view: defaultView, notifications,
    })
    toast.success('Preferences saved')
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    await addCategory.mutateAsync({ name: newCatName.trim(), yearly_allocated: 0, color: '#6C63FF' })
    setNewCatName('')
    toast.success('Category added')
  }

  const PREFS: { label: string; value: string; setter: React.Dispatch<React.SetStateAction<string>>; options: string[] }[] = [
    { label: 'Currency', value: currency, setter: setCurrency, options: CURRENCIES },
    { label: 'Year start', value: yearStart, setter: setYearStart, options: MONTHS },
    { label: 'Default view', value: defaultView, setter: setDefaultView, options: VIEWS },
    { label: 'Notifications', value: notifications, setter: setNotifications, options: NOTIF_OPTIONS },
  ]

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Personalize profile, currency, categories, automation, and privacy."
      />
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Profile
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setEditMode(!editMode)}>
                  {editMode ? 'Cancel' : 'Edit profile'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/30 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                  {name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-foreground">{name}</p>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
              </div>
              {editMode && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-muted-foreground">Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} className="mt-1 bg-background border-border" />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Email</Label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} className="mt-1 bg-background border-border" />
                  </div>
                  <Button onClick={saveProfile} disabled={updateSettings.isPending} className="w-full">Save</Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">2026 goal</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-foreground mb-3">{settings?.annual_goal_label}</p>
              <Progress value={settings?.annual_goal_pct ?? 0} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">{settings?.annual_goal_pct}% completed</p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {PREFS.map(({ label, value, setter, options }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{label}</span>
                  <Select value={value} onValueChange={setter}>
                    <SelectTrigger className="w-44 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button onClick={savePreferences} disabled={updateSettings.isPending} className="w-full mt-2">
                Save preferences
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Category manager</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-1.5 bg-background border border-border rounded-full px-3 py-1">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                    <span className="text-sm text-foreground">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory.mutate(cat.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="New category name"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  className="bg-background border-border"
                />
                <Button onClick={handleAddCategory} disabled={addCategory.isPending} size="icon" variant="outline" className="border-border shrink-0">
                  <Plus size={16} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
