const fs = require('fs');
const path = require('path');

class UploadsCleanup {
  constructor(uploadDir) {
    this.uploadDir = uploadDir;
  }

  async cleanupUploads() {
    try {
      console.log('🧹 Starting uploads cleanup...');
      
      if (!fs.existsSync(this.uploadDir)) {
        console.log('📁 Uploads directory does not exist, skipping cleanup');
        return { success: true, deletedCount: 0 };
      }

      const files = fs.readdirSync(this.uploadDir);
      const audioFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.webm'].includes(ext);
      });

      let deletedCount = 0;
      
      for (const file of audioFiles) {
        const filePath = path.join(this.uploadDir, file);
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`🗑️  Deleted: ${file}`);
        } catch (error) {
          console.error(`❌ Failed to delete ${file}:`, error.message);
        }
      }

      console.log(`✅ Cleanup completed: ${deletedCount} audio files deleted`);
      return { success: true, deletedCount };
      
    } catch (error) {
      console.error('❌ Uploads cleanup failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = UploadsCleanup;