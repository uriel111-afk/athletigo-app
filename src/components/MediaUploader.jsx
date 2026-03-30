import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image, Video, FileText } from "lucide-react";
import { toast } from "sonner";

export default function MediaUploader({ 
  currentMediaUrls = [], 
  onMediaUpdate, 
  label = "העלה קבצים",
  acceptedTypes = "image/*,video/*",
  maxFiles = 3,
  uploaderRole = "coach" // "coach" or "trainee"
}) {
  const [uploading, setUploading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState(currentMediaUrls || []);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (mediaUrls.length + files.length > maxFiles) {
      toast.error(`ניתן להעלות עד ${maxFiles} קבצים`);
      return;
    }

    setUploading(true);
    const uploadedUrls = [];

    for (const file of files) {
      const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024; // 50MB for video, 10MB for images
      
      if (file.size > maxSize) {
        toast.error(`הקובץ ${file.name} גדול מדי`);
        continue;
      }

      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      uploadedUrls.push(file_url);
    }

    const newMediaUrls = [...mediaUrls, ...uploadedUrls];
    setMediaUrls(newMediaUrls);
    onMediaUpdate(newMediaUrls);
    setUploading(false);
    toast.success(`${uploadedUrls.length} קבצים הועלו`);
  };

  const handleRemoveMedia = (urlToRemove) => {
    const newMediaUrls = mediaUrls.filter(url => url !== urlToRemove);
    setMediaUrls(newMediaUrls);
    onMediaUpdate(newMediaUrls);
  };

  const getFileType = (url) => {
    const ext = url.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
    return 'file';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold" style={{ color: '#000' }}>
          {label}
        </label>
        <span className="text-xs" style={{ color: '#7D7D7D' }}>
          {mediaUrls.length} / {maxFiles}
        </span>
      </div>

      {/* Media Preview */}
      {mediaUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {mediaUrls.map((url, idx) => {
            const fileType = getFileType(url);
            
            return (
              <div 
                key={idx}
                className="relative rounded-xl overflow-hidden"
                style={{ border: '2px solid #E6E6E6', backgroundColor: '#F7F7F7' }}
              >
                {fileType === 'image' ? (
                  <img 
                    src={url} 
                    alt={`Media ${idx + 1}`}
                    className="w-full h-32 object-cover"
                  />
                ) : fileType === 'video' ? (
                  <video 
                    src={url}
                    className="w-full h-32 object-cover"
                    controls
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center">
                    <FileText className="w-8 h-8" style={{ color: '#7D7D7D' }} />
                  </div>
                )}
                
                <button
                  onClick={() => handleRemoveMedia(url)}
                  className="absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ backgroundColor: '#f44336', color: 'white' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Button */}
      {mediaUrls.length < maxFiles && (
        <div>
          <input
            type="file"
            accept={acceptedTypes}
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id={`media-upload-${uploaderRole}`}
            disabled={uploading}
          />
          <label htmlFor={`media-upload-${uploaderRole}`}>
            <Button
              as="span"
              disabled={uploading}
              className="w-full rounded-xl py-5 font-bold cursor-pointer"
              style={{ 
                border: '2px dashed #E6E6E6', 
                backgroundColor: 'white',
                color: uploaderRole === 'coach' ? '#FF6F20' : '#4CAF50'
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  מעלה...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 ml-2" />
                  {uploaderRole === 'coach' ? '📸 העלה הדגמה' : '🎥 העלה ביצוע שלי'}
                </>
              )}
            </Button>
          </label>
          <p className="text-xs mt-2 text-center" style={{ color: '#7D7D7D' }}>
            תמונות עד 10MB, סרטונים עד 50MB
          </p>
        </div>
      )}
    </div>
  );
}