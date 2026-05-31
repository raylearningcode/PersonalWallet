import { useEffect, useState } from 'react'

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setVisible(window.innerHeight - vv.height > 150)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])
  return visible
}
