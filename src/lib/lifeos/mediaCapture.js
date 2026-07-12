// Shared native-media capture — the camera / gallery-photo logic used
// by BOTH FileManager and the trainee gallery, so the permission +
// Capacitor.getPhoto handling lives in exactly one place (no
// duplication). Returns a File, or null on cancel / failure (the
// caller then runs its own upload pipeline).
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { toast } from 'sonner';
import { pushDebugLog } from '@/lib/debugLog';

export const isNativePlatform = Capacitor.isNativePlatform();

// source: 'camera' (needs runtime CAMERA grant) | 'gallery' (Photos).
// Camera path uses a Uri result (reliable for full-res); gallery keeps
// the working Base64 path. Both return a JPEG/PNG File ready to upload.
export async function captureNativePhoto(source) {
  const isCamera = source === 'camera';
  try {
    pushDebugLog('mediaCapture', 'native-camera-start', { source });

    // android.permission.CAMERA is declared in the manifest, so Capacitor
    // requires an explicit runtime grant before the camera intent opens.
    // The Photos (gallery) source does not need it.
    if (isCamera) {
      let perm = await Camera.checkPermissions();
      pushDebugLog('mediaCapture', 'camera-perm-check', { state: perm?.camera });
      if (perm.camera !== 'granted') {
        perm = await Camera.requestPermissions({ permissions: ['camera'] });
        pushDebugLog('mediaCapture', 'camera-perm-request', { state: perm?.camera });
      }
      if (perm.camera !== 'granted') {
        toast.error('אין הרשאת מצלמה — אפשר לאשר בהגדרות המכשיר');
        return null;
      }
    }

    const image = await Camera.getPhoto(
      isCamera
        ? {
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            width: 1600,
            correctOrientation: true,
            saveToGallery: false,
          }
        : {
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Photos,
            width: 1600,
            saveToGallery: false,
          }
    );

    pushDebugLog('mediaCapture', 'native-camera-got-image', {
      format: image.format,
      hasData: !!(image.base64String || image.webPath),
    });

    const mimeString = `image/${image.format}`;
    let blob;
    if (image.webPath) {
      const res = await fetch(image.webPath);
      blob = await res.blob();
    } else {
      const byteString = atob(image.base64String);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeString });
    }

    return new File([blob], `photo-${Date.now()}.${image.format}`, { type: mimeString });
  } catch (err) {
    console.log('[mediaCapture camera error]', err);
    pushDebugLog('mediaCapture', 'native-camera-error', {
      message: err?.message, code: err?.code,
    });
    // Capacitor throws when the user cancels the picker — stay silent.
    if ((err?.message || '').toLowerCase().includes('cancel')) return null;
    toast.error('שגיאה במצלמה: ' + (err?.message || 'שגיאה לא ידועה'));
    return null;
  }
}
