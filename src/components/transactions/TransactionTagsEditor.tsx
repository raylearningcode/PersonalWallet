import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getTags, addTag, getTransactionTags, addTagToTransaction, removeTagFromTransaction, getDefaultTagColors } from '@/lib/tags'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'

export function TransactionTagsEditor({ transactionId }: { transactionId: string }) {
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(getDefaultTagColors()[0])
  const allTags = useMemo(() => getTags(), [])
  const txTags = useMemo(() => getTransactionTags(transactionId), [transactionId])
  const availableTags = useMemo(() => allTags.filter(t => !txTags.some(tx => tx.id === t.id)), [allTags, txTags])

  const handleAddTag = () => {
    if (!newTagName.trim()) {
      toast.error('Tag name required')
      return
    }
    const tag = addTag(newTagName.trim(), newTagColor)
    addTagToTransaction(transactionId, tag.id)
    setNewTagName('')
    setNewTagColor(getDefaultTagColors()[0])
    setShowAddTag(false)
    toast.success(`Tag "${tag.name}" added`)
  }

  const handleRemoveTag = (tagId: string) => {
    removeTagFromTransaction(transactionId, tagId)
    toast.success('Tag removed')
  }

  const handleQuickAddTag = (tagId: string) => {
    addTagToTransaction(transactionId, tagId)
    toast.success('Tag added')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {txTags.map(tag => (
          <div key={tag.id} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style={{ backgroundColor: tag.color + '22', border: `1.5px solid ${tag.color}` }}>
            <span style={{ color: tag.color }}>{tag.name}</span>
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="flex items-center justify-center rounded-full hover:opacity-70"
              aria-label="Remove tag"
            >
              <X className="h-3 w-3" style={{ color: tag.color }} />
            </button>
          </div>
        ))}
      </div>

      {!showAddTag ? (
        <>
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {availableTags.slice(0, 4).map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleQuickAddTag(tag.id)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ backgroundColor: tag.color + '11', border: `1px dashed ${tag.color}` }}
                >
                  <Plus className="h-3 w-3" style={{ color: tag.color }} />
                  <span style={{ color: tag.color }}>{tag.name}</span>
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={() => setShowAddTag(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Add tag
          </Button>
        </>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-secondary/50 p-3">
          <div>
            <Label className="text-xs text-muted-foreground">Tag name</Label>
            <Input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              placeholder="e.g., Receipt, Important, Client"
              className="mt-1 h-9 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleAddTag()}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Color</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {getDefaultTagColors().map(color => (
                <button
                  key={color}
                  onClick={() => setNewTagColor(color)}
                  className={`h-8 w-8 rounded-full border-2 ${newTagColor === color ? 'border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddTag}>Create & add</Button>
            <Button size="sm" variant="secondary" onClick={() => { setShowAddTag(false); setNewTagName(''); setNewTagColor(getDefaultTagColors()[0]) }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
