// 큰 사진을 긴 변 2048px JPEG로 줄여 Gemini 업로드 시간을 단축
// 채팅 캡처·기프티콘 바코드 숫자가 읽히는 해상도는 유지
const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

export interface ProcessedFile {
  dataUrl: string;
  mimeType: string;
}

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 디코딩 실패'));
    img.src = src;
  });

// 이미지가 아니거나(PDF 등), 디코딩에 실패하거나, 압축 결과가 더 크면 원본 그대로 반환
export const compressImage = async (file: File): Promise<ProcessedFile> => {
  const original = async (): Promise<ProcessedFile> => ({
    dataUrl: await readAsDataUrl(file),
    mimeType: file.type,
  });

  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return original();
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original();

    // 투명 PNG가 JPEG 변환 시 검게 나오지 않도록 흰 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return original();

    return { dataUrl: await readAsDataUrl(blob), mimeType: 'image/jpeg' };
  } catch {
    return original();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
