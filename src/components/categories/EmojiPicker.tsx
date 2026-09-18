import { CATEGORY_EMOJI_GROUPS } from '@/lib/categoryIcons'

type EmojiPickerProps = {
  value: string
  onChange: (emoji: string) => void
  ariaLabel?: string
}

export function EmojiPicker({ value, onChange, ariaLabel = 'Choose category icon' }: EmojiPickerProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="space-y-3">
      <button
        type="button"
        aria-label="Remove icon"
        onClick={() => onChange('')}
        className={`flex h-10 w-full items-center justify-center rounded-xl border text-xs font-bold transition-colors ${
          value === ''
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-secondary text-muted-foreground hover:border-primary/40'
        }`}
      >
        No icon
      </button>
      {CATEGORY_EMOJI_GROUPS.map(group => (
        <div key={group.name}>
          <p className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">{group.name}</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {group.emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                aria-label={`Use emoji ${emoji}`}
                aria-pressed={value === emoji}
                onClick={() => onChange(emoji)}
                className={`flex h-11 items-center justify-center rounded-xl border text-xl transition-colors ${
                  value === emoji
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary hover:border-primary/40'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
