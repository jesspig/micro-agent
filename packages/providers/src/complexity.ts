/**
 * 媒体检测工具
 */

/**
 * 检测是否有图片媒体
 */
export function hasImageMedia(media?: string[]): boolean {
  if (!media || media.length === 0) return false;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  return media.some(m => {
    const lower = m.toLowerCase();
    return imageExtensions.some(ext => lower.endsWith(ext)) ||
      lower.includes('image/') ||
      lower.startsWith('data:image');
  });
}