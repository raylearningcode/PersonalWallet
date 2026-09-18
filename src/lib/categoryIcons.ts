export const CATEGORY_EMOJI_GROUPS = [
  { name: 'Money', emojis: ['💰', '💳', '🏦', '📈', '🧾', '🛡️'] },
  { name: 'Food', emojis: ['🍔', '🍜', '🍚', '☕', '🍿', '🛒'] },
  { name: 'Home', emojis: ['🏠', '💡', '🛏️', '🧹', '🔧', '🌱'] },
  { name: 'Transport', emojis: ['🚗', '🚌', '🚆', '✈️', '⛽', '🅿️'] },
  { name: 'Health', emojis: ['💊', '🏥', '🦷', '🏋️', '🧘', '❤️'] },
  { name: 'Life', emojis: ['💼', '🎓', '👶', '👕', '💄', '🎁'] },
  { name: 'Fun', emojis: ['🎮', '🎬', '🎵', '📚', '📱', '🎉'] },
] as const

export const CATEGORY_EMOJIS = CATEGORY_EMOJI_GROUPS.flatMap(group => group.emojis)
