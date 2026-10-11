import fs from 'fs';
import path from 'path';

/**
 * Safely delete marketplace image files from uploads directory on disk
 * @param {string | string[]} imagesData JSON string or Array of image URLs/paths
 */
export function deletePostImageFiles(imagesData) {
  try {
    if (!imagesData) return;
    let list = [];
    if (typeof imagesData === 'string') {
      try {
        list = JSON.parse(imagesData);
      } catch (_) {
        if (imagesData.trim().length > 0) list = [imagesData];
      }
    } else if (Array.isArray(imagesData)) {
      list = imagesData;
    }

    if (!Array.isArray(list)) return;

    for (const imgUrl of list) {
      if (typeof imgUrl !== 'string') continue;

      // Extract path starting from /uploads/
      const uploadsIndex = imgUrl.indexOf('/uploads/');
      if (uploadsIndex !== -1) {
        const relativePath = imgUrl.substring(uploadsIndex);
        const cleanPath = relativePath.replace(/^\//, '');
        const absolutePath = path.join(process.cwd(), cleanPath);

        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
          console.log(`🗑️ Deleted marketplace image from disk: ${absolutePath}`);
        } else {
          console.log(`⚠️ Image file not found on disk: ${absolutePath}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error unlinking marketplace image files:', err);
  }
}
