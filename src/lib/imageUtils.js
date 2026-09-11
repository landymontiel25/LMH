// Shrinks an image file down to a small JPEG data URL for sending to the AI
// verification endpoint -- the original file still gets uploaded to Storage
// at full quality separately. Keeps the request tiny and fast regardless of
// how large the original photo is (a phone photo can be several MB).
export function fileToSmallDataUrl(file, maxSize = 768, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that photo.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale) || 1;
        canvas.height = Math.round(img.height * scale) || 1;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
