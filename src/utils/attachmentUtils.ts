/**
 * Utility functions for handling, compressing, and managing attachments and photos.
 */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads a File and compresses it if it is an image to ensure smooth localStorage persistence.
 */
export function processUploadedFile(file: File): Promise<{ dataUrl: string; fileSizeStr: string; isImage: boolean }> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith('image/');

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.onload = () => {
      const result = reader.result as string;

      if (!isImage) {
        resolve({
          dataUrl: result,
          fileSizeStr: formatFileSize(file.size),
          isImage: false,
        });
        return;
      }

      // If it's an image, optimize dimensions if needed to prevent localStorage quota issues
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.82);
            // approximate size
            const sizeBytes = Math.round((compressed.length * 3) / 4);
            resolve({
              dataUrl: compressed,
              fileSizeStr: formatFileSize(sizeBytes),
              isImage: true,
            });
            return;
          }
        }

        // Always optimize images through canvas for optimal mobile performance and fast rendering
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // White background for transparent PNGs
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.82);
            const sizeBytes = Math.round((compressed.length * 3) / 4);
            resolve({
              dataUrl: compressed,
              fileSizeStr: formatFileSize(sizeBytes),
              isImage: true,
            });
            return;
          }
        } catch (e) {
          console.warn('Canvas optimization fallback:', e);
        }

        // Under max dimensions or canvas fail, return original dataUrl
        resolve({
          dataUrl: result,
          fileSizeStr: formatFileSize(file.size),
          isImage: true,
        });
      };
      img.onerror = () => {
        // Fallback to original
        resolve({
          dataUrl: result,
          fileSizeStr: formatFileSize(file.size),
          isImage: true,
        });
      };
      img.src = result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Returns the preview URL of the attachment, or generates a clean SVG document
 * representation if previewUrl is missing.
 */
export function getAttachmentPreviewUrl(
  attachment: { name: string; type: string; previewUrl?: string },
  transactionInfo?: { number?: string; date?: string; subject?: string; entity?: string }
): string {
  if (attachment.previewUrl) {
    return attachment.previewUrl;
  }

  // Create an SVG representation of an official archived paper
  const number = transactionInfo?.number || '١٠٤٢/ص';
  const date = transactionInfo?.date || '2026-08-14';
  const subject = transactionInfo?.subject || 'كتاب رسمي ومرفق ممسوح ضوئياً';
  const entity = transactionInfo?.entity || 'الأمانة العامة / الدائرة الإدارية والمالية';
  const name = attachment.name || 'وثيقة رسمية';
  const type = attachment.type || 'كتاب رئيسي';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1130" width="800" height="1130" style="background:#ffffff; font-family:'Tajawal',Arial,sans-serif;">
    <rect width="100%" height="100%" fill="#faf9f6" />
    <rect x="25" y="25" width="750" height="1080" fill="#ffffff" stroke="#d6d3d1" stroke-width="2" rx="6"/>
    <rect x="35" y="35" width="730" height="1060" fill="none" stroke="#e7e5e4" stroke-width="1"/>
    
    <!-- Header -->
    <text x="730" y="80" text-anchor="end" font-size="16" font-weight="bold" fill="#1c1917">جمهورية العراق</text>
    <text x="730" y="105" text-anchor="end" font-size="14" fill="#44403c">قسم الشؤون الإدارية والمالية</text>
    <text x="730" y="128" text-anchor="end" font-size="12" fill="#78716c">شعبة الذاتية والأرشفة الإلكترونية</text>

    <!-- Center Emblem Simulation -->
    <circle cx="400" cy="100" r="32" fill="#fef3c7" stroke="#b45309" stroke-width="1.5" />
    <text x="400" y="97" text-anchor="middle" font-size="20">🦅</text>
    <text x="400" y="118" text-anchor="middle" font-size="9" font-weight="bold" fill="#78350f">الله ★ أكبر</text>

    <text x="70" y="80" text-anchor="start" font-size="13" font-weight="bold" fill="#1c1917">العدد: ${number}</text>
    <text x="70" y="105" text-anchor="start" font-size="13" fill="#44403c">التاريخ: ${date}</text>
    <text x="70" y="128" text-anchor="start" font-size="11" fill="#78716c">المرفق: ${type}</text>

    <!-- Divider -->
    <line x1="50" y1="150" x2="750" y2="150" stroke="#1c1917" stroke-width="2"/>
    <line x1="50" y1="154" x2="750" y2="154" stroke="#78716c" stroke-width="0.8"/>

    <!-- Content Area -->
    <text x="730" y="210" text-anchor="end" font-size="15" font-weight="bold" fill="#1c1917">إلى / ${entity}</text>
    <text x="400" y="260" text-anchor="middle" font-size="17" font-weight="bold" fill="#0f172a" text-decoration="underline">م / ${subject}</text>

    <!-- Letter Body -->
    <text x="720" y="320" text-anchor="end" font-size="14" fill="#334155">تحية طيبة وتفضل بالاطلاع...</text>
    <text x="720" y="360" text-anchor="end" font-size="13.5" fill="#334155">إشارةً إلى المقتضيات الإدارية وسياقات العمل الرسمية المعتمدة في مركزنا،</text>
    <text x="720" y="390" text-anchor="end" font-size="13.5" fill="#334155">نرفق طياً الوثيقة الممسوحة ضوئياً والموسومة بعنوان:</text>
    <text x="400" y="440" text-anchor="middle" font-size="15" font-weight="bold" fill="#b45309">« ${name} »</text>
    <text x="720" y="490" text-anchor="end" font-size="13.5" fill="#334155">راجين التفضل بالاطلاع واتخاذ الإجراءات الإدارية والموافقات اللازمة حسب الصلاحيات.</text>

    <!-- Placeholder Document Visual Box -->
    <rect x="100" y="540" width="600" height="340" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 3" rx="8"/>
    <text x="400" y="680" text-anchor="middle" font-size="14" font-weight="bold" fill="#64748b">📄 وثيقة ممسوحة ضوئياً بالألوان - نسخة أصلية محفوظة</text>
    <text x="400" y="710" text-anchor="middle" font-size="12" fill="#94a3b8">يمكنك النقر على زر «إضافة صور / استبدال» لرفع صورة الوثيقة الحقيقية في أي وقت</text>

    <!-- Footer Seals and Signatures -->
    <circle cx="200" cy="980" r="50" fill="none" stroke="#047857" stroke-width="2" stroke-dasharray="3 2"/>
    <text x="200" y="975" text-anchor="middle" font-size="11" font-weight="bold" fill="#047857">قسم الذاتية والأرشفة</text>
    <text x="200" y="995" text-anchor="middle" font-size="10" fill="#047857">تم التدقيق والمطابقة ✓</text>

    <text x="650" y="960" text-anchor="middle" font-size="14" font-weight="bold" fill="#1c1917">مسؤول وحدة الذاتية</text>
    <path d="M 580 985 Q 630 965 670 1000 T 710 990" fill="none" stroke="#1e293b" stroke-width="2"/>
    <text x="650" y="1025" text-anchor="middle" font-size="11" fill="#64748b">${date}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

