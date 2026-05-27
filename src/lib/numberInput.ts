export function formatNumberInput(value: string | number) {
  const raw = String(value ?? '').replace(/[^\d.]/g, '')
  if (!raw) return ''
  const [integer = '', decimal] = raw.split('.')
  const grouped = integer.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0'
  return decimal !== undefined ? `${grouped}.${decimal.slice(0, 2)}` : grouped
}

export function parseNumberInput(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
