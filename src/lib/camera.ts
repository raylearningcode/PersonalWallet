let cameraPlugin: any = null

// Load Camera plugin dynamically if available
async function loadCameraPlugin() {
  if (cameraPlugin) return cameraPlugin
  // On web (PWA/desktop browser) the plugin is a no-op proxy whose calls
  // reject — skip it entirely so callers get null instead of promise errors.
  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  try {
    const { Camera } = await import('@capacitor/camera')
    cameraPlugin = Camera
    return Camera
  } catch {
    return null
  }
}

export async function takePhotoWithCamera(): Promise<string | null> {
  try {
    const Camera = await loadCameraPlugin()
    if (!Camera) return null

    const photo = (await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: 'base64',
      source: 'CAMERA',
      correctOrientation: true,
    })) as any

    return photo.base64String || null
  } catch (err) {
    console.warn('Camera capture failed:', err instanceof Error ? err.message : 'Unknown error')
    return null
  }
}

export async function pickPhotoFromLibrary(): Promise<string | null> {
  try {
    const Camera = await loadCameraPlugin()
    if (!Camera) return null

    const photo = (await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: 'base64',
      source: 'PHOTOS',
      correctOrientation: true,
    })) as any

    return photo.base64String || null
  } catch (err) {
    console.warn('Photo picker failed:', err instanceof Error ? err.message : 'Unknown error')
    return null
  }
}

export async function isNativeCameraAvailable(): Promise<boolean> {
  try {
    const Camera = await loadCameraPlugin()
    return !!Camera
  } catch {
    return false
  }
}
