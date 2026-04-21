import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { FileText, Trash2, Download } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const BUCKET = 'trainee-documents';

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
};

export function TraineeDocumentUpload({ traineeId, coachId, currentUser }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const { data: docs } = useQuery({
    queryKey: ['trainee-documents', traineeId],
    queryFn: async () => {
      if (!traineeId) return [];
      const { data, error } = await supabase
        .from('trainee_documents')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[TraineeDocs] load failed:', error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!traineeId,
  });

  // Realtime — coach uploads a file on laptop → trainee phone refreshes live.
  useEffect(() => {
    if (!traineeId) return;
    const ch = supabase
      .channel(`trainee-docs-${traineeId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trainee_documents',
        filter: `trainee_id=eq.${traineeId}`
      }, () => queryClient.invalidateQueries({ queryKey: ['trainee-documents', traineeId] }))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [traineeId, queryClient]);

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`הקובץ גדול מדי. מקסימום ${MAX_SIZE_MB} מגה`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${traineeId}/${Date.now()}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file);

      if (uploadErr) {
        console.error('[TraineeDocs] upload failed:', uploadErr);
        toast.error('העלאה נכשלה: ' + (uploadErr.message || 'שגיאה לא ידועה'));
        return;
      }

      const isCoachUploader = currentUser?.id && currentUser.id === coachId;
      const { error: dbErr } = await supabase
        .from('trainee_documents')
        .insert({
          trainee_id: traineeId,
          coach_id: coachId ?? null,
          uploaded_by_user_id: currentUser?.id ?? null,
          uploaded_by_role: isCoachUploader ? 'coach' : 'trainee',
          file_name: file.name,
          file_path: path,
          file_type: file.type || 'application/octet-stream',
          file_size_bytes: file.size,
          description: description.trim() || null,
        });

      if (dbErr) {
        console.error('[TraineeDocs] db insert failed:', dbErr);
        toast.error('שמירת פרטי הקובץ נכשלה: ' + (dbErr.message || ''));
        // Roll back the storage upload
        await supabase.storage.from(BUCKET).remove([path]);
        return;
      }

      toast.success('הקובץ הועלה בהצלחה');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['trainee-documents', traineeId] });
    } catch (err) {
      console.error('[TraineeDocs] unexpected:', err);
      toast.error('שגיאה בלתי צפויה בהעלאה');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDownload(doc) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      console.error('[TraineeDocs] signed url failed:', error);
      toast.error('לא ניתן להוריד את הקובץ');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function handleDelete(doc) {
    if (!window.confirm(`למחוק את "${doc.file_name}"?`)) return;
    try {
      await supabase.storage.from(BUCKET).remove([doc.file_path]);
      const { error } = await supabase.from('trainee_documents').delete().eq('id', doc.id);
      if (error) {
        console.error('[TraineeDocs] delete failed:', error);
        toast.error('המחיקה נכשלה: ' + (error.message || ''));
        return;
      }
      toast.success('נמחק');
      queryClient.invalidateQueries({ queryKey: ['trainee-documents', traineeId] });
    } catch (err) {
      console.error('[TraineeDocs] delete exception:', err);
      toast.error('שגיאה במחיקה');
    }
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // A user can delete a doc they uploaded; the coach can delete any doc
  // for their trainees.
  const canDelete = (doc) =>
    !!currentUser?.id && (
      doc.uploaded_by_user_id === currentUser.id ||
      currentUser.id === coachId
    );

  return (
    <div style={{ marginTop: 16 }} dir="rtl">
      <h3 style={{ color: '#1a1a1a', fontWeight: 700, marginBottom: 12 }}>
        מסמכים נוספים
      </h3>

      {/* Upload panel */}
      <div style={{
        background: '#FFF9F0', border: '1px solid #FFE5D0', borderRadius: 12,
        padding: 16, marginBottom: 16,
      }}>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="תיאור (לדוגמה: אישור רופא)"
          style={{
            width: '100%', padding: 10, borderRadius: 8, border: '1px solid #FFE5D0',
            marginBottom: 10, background: '#FFFFFF', color: '#1a1a1a', fontSize: 14,
            boxSizing: 'border-box',
          }}
        />

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFilePick}
          style={{ display: 'none' }}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !traineeId}
          style={{
            width: '100%', padding: 12, background: '#FF6F20', color: '#FFFFFF',
            border: 'none', borderRadius: 8, fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? 'מעלה...' : 'בחר קובץ להעלאה'}
        </button>

        <div style={{
          marginTop: 8, fontSize: 12, color: '#6b7280', textAlign: 'center',
        }}>
          עד {MAX_SIZE_MB} מגה · תמונה, PDF, Word, Excel
        </div>
      </div>

      {/* Documents list */}
      {(!docs || docs.length === 0) ? (
        <div style={{
          padding: 20, textAlign: 'center', color: '#6b7280',
          background: '#FFF9F0', borderRadius: 8,
        }}>
          אין מסמכים מועלים
        </div>
      ) : (
        docs.map((doc) => (
          <div
            key={doc.id}
            style={{
              background: '#FFFFFF', border: '1px solid #FFE5D0',
              borderRight: '3px solid #FF6F20', borderRadius: 8,
              padding: 12, marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <FileText size={24} color="#FF6F20" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600, color: '#1a1a1a',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {doc.file_name}
              </div>
              {doc.description && (
                <div style={{ fontSize: 13, color: '#FF6F20', marginTop: 2 }}>
                  {doc.description}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {formatSize(doc.file_size_bytes)} · הועלה ע&quot;י{' '}
                {doc.uploaded_by_role === 'coach' ? 'המאמן' : 'המתאמן'}
              </div>
            </div>
            <button onClick={() => handleDownload(doc)} style={iconBtnStyle} title="הורדה">
              <Download size={18} color="#FF6F20" />
            </button>
            {canDelete(doc) && (
              <button onClick={() => handleDelete(doc)} style={iconBtnStyle} title="מחיקה">
                <Trash2 size={18} color="#dc2626" />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default TraineeDocumentUpload;
