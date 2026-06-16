// Shared "download a signed document" path used by every row in
// DocumentSigningTab. Two branches:
//   • existingUrl present  → trigger a browser download of that URL
//                            (legacy cooperation_agreement rows that
//                            stored their PDF in Supabase Storage).
//   • else                 → snapshot nodeRef.current with html2canvas
//                            at fixed 720px width, slice into A4 pages
//                            with jspdf, save as ${fileName}.pdf.
//
// jspdf + html2canvas are dynamically imported so the PDF code only
// loads when the user actually clicks the download button — keeps the
// initial Trainee Profile bundle cost unchanged.

import { toast } from 'sonner';

function sanitizeFileName(name) {
  const safe = (name || 'document')
    .replace(/[^a-zA-Z0-9_֐-׿\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  return safe || 'document';
}

function triggerUrlDownload(url, safeName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.pdf`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadSignedDocument({
  existingUrl,
  nodeRef,
  fileName,
  onError,
} = {}) {
  const safeName = sanitizeFileName(fileName);
  try {
    if (existingUrl && typeof existingUrl === 'string') {
      triggerUrlDownload(existingUrl, safeName);
      return;
    }

    const node = nodeRef?.current;
    if (!node) {
      throw new Error('אין תוכן להמיר ל-PDF');
    }

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    // Fixed render width — the wrapper around nodeRef enforces 720px,
    // windowWidth keeps html2canvas from re-flowing to the live viewport.
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF',
      windowWidth: 720,
    });

    // Slicing math copied from the legacy DocumentSigningTab.generatePdfFromRef
    // so behaviour is identical to the existing inline cooperation_agreement
    // sign path (proven on Android WebView).
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = 210;
    const margin = 10;
    const contentW = pageW - margin * 2;
    const pageH = 297 - margin * 2;
    const imgH = (canvas.height / canvas.width) * contentW;

    if (imgH <= pageH) {
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, imgH);
    } else {
      const totalPages = Math.ceil(imgH / pageH);
      for (let p = 0; p < totalPages; p++) {
        if (p > 0) pdf.addPage();
        const srcY = (p * pageH / imgH) * canvas.height;
        const srcH = Math.min((pageH / imgH) * canvas.height, canvas.height - srcY);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = srcH;
        sliceCanvas.getContext('2d').drawImage(
          canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH,
        );
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.9);
        const sliceH = (srcH / canvas.width) * contentW;
        pdf.addImage(sliceData, 'JPEG', margin, margin, contentW, sliceH);
      }
    }

    pdf.save(`${safeName}.pdf`);
  } catch (err) {
    console.error('[downloadSignedDocument] failed:', err);
    if (onError) onError(err);
    else toast.error('הורדת המסמך נכשלה: ' + (err?.message || 'שגיאה לא ידועה'));
  }
}
