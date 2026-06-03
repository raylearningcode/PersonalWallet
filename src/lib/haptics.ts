import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const safe = (fn: () => Promise<void>) => fn().catch(() => undefined)

export const hapticLight = () => safe(() => Haptics.impact({ style: ImpactStyle.Light }))
export const hapticMedium = () => safe(() => Haptics.impact({ style: ImpactStyle.Medium }))
export const hapticSuccess = () => safe(() => Haptics.notification({ type: NotificationType.Success }))
