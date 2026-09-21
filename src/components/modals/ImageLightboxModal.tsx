import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
  RotateCw, 
  Download, 
  ChevronRight, 
  ChevronLeft,
  Paperclip,
  Share2,
  Printer
} from 'lucide-react';
import { Attachment } from '../../types';
import { getAttachmentPreviewUrl } from '../../utils/attachmentUtils';

interface ImageLightboxModalProps {
  attachment: Attachment | null;
  attachments?: Attachment[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  transactionTitle?: string;
  transactionNumber?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  attachment,
  attachments = [],
  currentIndex = 0,
  onIndexChange,
  transactionTitle,
  transactionNumber,
  onClose,
}) => {
  const [internalIndex, setInternalIndex] = useState<number>(currentIndex);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);

  // References to keep event handlers fresh and avoid stale closures
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;

  const panRef = useRef<{ x: number; y: number }>(pan);
  panRef.current = pan;

  const modalRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mouseDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Touch gesture tracking
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchSwipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  // Sync internal index with currentIndex prop
  useEffect(() => {
    if (typeof currentIndex === 'number' && currentIndex >= 0) {
      setInternalIndex(currentIndex);
    }
  }, [currentIndex]);

  // Lock body scroll cleanly on mount, and restore on unmount
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || '';
    };
  }, []);

  // Safe close handler that guarantees restoring body overflow
  const handleSafeClose = useCallback(() => {
    document.body.style.overflow = '';
    onClose();
  }, [onClose]);

  // Handle active attachment selection
  const activeAttachment = (attachments.length > 0 && attachments[internalIndex])
    ? attachments[internalIndex]
    : attachment;

  // Always compute safe previewUrl with fallback - NEVER return null
  const previewUrl = activeAttachment
    ? (activeAttachment.previewUrl || getAttachmentPreviewUrl(activeAttachment, {
        number: transactionNumber,
        subject: transactionTitle,
      }))
    : '';

  const handleNext = useCallback(() => {
    if (attachments.length <= 1) return;
    const nextIdx = (internalIndex + 1) % attachments.length;
    setInternalIndex(nextIdx);
    onIndexChange?.(nextIdx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, [attachments.length, internalIndex, onIndexChange]);

  const handlePrev = useCallback(() => {
    if (attachments.length <= 1) return;
    const prevIdx = (internalIndex - 1 + attachments.length) % attachments.length;
    setInternalIndex(prevIdx);
    onIndexChange?.(prevIdx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, [attachments.length, internalIndex, onIndexChange]);

  // Reset zoom, pan, and rotation
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  // Native Non-Passive Wheel Listener:
  // Strictly prevents page scrolling in the background and smoothly zooms the document
  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl) return;

    const handleWheel = (e: WheelEvent) => {
      // PREVENT BACKGROUND PAGE & TRANSACTIONS LIST SCROLLING
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoom((prev) => {
        const next = Math.min(Math.max(prev + delta, 0.5), 5);
        if (next <= 1) {
          setPan({ x: 0, y: 0 });
        }
        return Number(next.toFixed(2));
      });
    };

    modalEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      modalEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Native Non-Passive Touch Listeners for Pinch-to-Zoom & Pan on Mobile
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Multi-touch pinch start
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartDistRef.current = dist;
        touchStartZoomRef.current = zoomRef.current;
      } else if (e.touches.length === 1) {
        // Single touch start (for pan or swipe)
        const touch = e.touches[0];
        touchSwipeStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
        lastTouchPosRef.current = {
          x: touch.clientX,
          y: touch.clientY,
        };

        // Double tap detection
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          e.preventDefault();
          if (zoomRef.current > 1) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          } else {
            setZoom(2.2);
          }
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDistRef.current) {
        // Pinching to zoom
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = dist / touchStartDistRef.current;
        const newZoom = Math.min(Math.max(touchStartZoomRef.current * ratio, 0.5), 5);
        setZoom(Number(newZoom.toFixed(2)));
        if (newZoom <= 1) {
          setPan({ x: 0, y: 0 });
        }
      } else if (e.touches.length === 1 && zoomRef.current > 1 && lastTouchPosRef.current) {
        // Single finger panning when zoomed in
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - lastTouchPosRef.current.x;
        const dy = touch.clientY - lastTouchPosRef.current.y;
        setPan((prev) => ({
          x: prev.x + dx,
          y: prev.y + dy,
        }));
        lastTouchPosRef.current = {
          x: touch.clientX,
          y: touch.clientY,
        };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchStartDistRef.current = null;
      }
      if (e.touches.length === 0) {
        // If not zoomed, check if was a horizontal swipe to switch documents
        if (zoomRef.current <= 1 && touchSwipeStartRef.current && lastTouchPosRef.current) {
          const deltaX = lastTouchPosRef.current.x - touchSwipeStartRef.current.x;
          const deltaY = lastTouchPosRef.current.y - touchSwipeStartRef.current.y;
          const deltaTime = Date.now() - touchSwipeStartRef.current.time;

          if (deltaTime < 500 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            // Arabic RTL: swiping right goes to previous, swiping left goes to next
            if (deltaX > 0) {
              handlePrev();
            } else {
              handleNext();
            }
          }
        }
        touchSwipeStartRef.current = null;
        lastTouchPosRef.current = null;
      }
    };

    stageEl.addEventListener('touchstart', onTouchStart, { passive: false });
    stageEl.addEventListener('touchmove', onTouchMove, { passive: false });
    stageEl.addEventListener('touchend', onTouchEnd, { passive: false });
    stageEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      stageEl.removeEventListener('touchstart', onTouchStart);
      stageEl.removeEventListener('touchmove', onTouchMove);
      stageEl.removeEventListener('touchend', onTouchEnd);
      stageEl.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [handleNext, handlePrev]);

  // Mouse Drag Panning (when zoomed in on desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1 && e.button === 0) {
      setIsMouseDown(true);
      mouseDragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMouseDown && mouseDragStartRef.current && zoom > 1) {
      setPan({
        x: e.clientX - mouseDragStartRef.current.x,
        y: e.clientY - mouseDragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
    mouseDragStartRef.current = null;
  };

  // Double Click to Toggle Zoom on Desktop
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2.2);
    }
  };

  // Register Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSafeClose();
      } else if (e.key === 'ArrowRight' && attachments.length > 1) {
        handlePrev();
      } else if (e.key === 'ArrowLeft' && attachments.length > 1) {
        handleNext();
      } else if (e.key === '0' || e.key === 'Home') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSafeClose, handlePrev, handleNext, attachments.length]);

  if (!activeAttachment || !previewUrl) return null;

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = activeAttachment.name || 'document_image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Instant Print
  const handlePrint = () => {
    if (!previewUrl) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
          <head>
            <meta charset="utf-8">
            <title>${activeAttachment.name || 'طباعة كتاب رسمي'}</title>
            <style>
              @page { size: A4; margin: 10mm; }
              body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: #fff; font-family: sans-serif; }
              img { max-width: 100%; height: auto; display: block; }
            </style>
          </head>
          <body>
            <img src="${previewUrl}" onload="setTimeout(function(){ window.print(); }, 250);" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // Quick Share via Web Share API or Clipboard
  const handleShare = async () => {
    const title = activeAttachment.name || 'وثيقة رسمية';
    const text = `معاملة رسمية: ${transactionNumber ? `العدد: ${transactionNumber}` : ''} ${transactionTitle ? `- ${transactionTitle}` : ''}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share dismissed', err);
      }
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    }
  };

  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 z-[9000] w-screen h-[100dvh] max-h-[100dvh] overflow-hidden bg-stone-950/95 backdrop-blur-md flex flex-col justify-between p-2 sm:p-4 text-white select-none"
      dir="rtl"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Toast feedback for copied link */}
      {copiedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2 bg-emerald-600 text-white rounded-lg shadow-2xl text-xs font-bold animate-bounce">
          تم نسخ بيانات المعاملة للمشاركة بنجاح!
        </div>
      )}

      {/* FIXED TOP EXIT BUTTON - ALWAYS VISIBLE */}
      <button
        type="button"
        id="btn-lightbox-fixed-exit"
        onClick={handleSafeClose}
        className="fixed top-2.5 left-2.5 sm:top-4 sm:left-4 z-[99999] inline-flex items-center gap-1.5 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs sm:text-sm shadow-2xl border-2 border-white/90 transition-transform active:scale-95 cursor-pointer select-none"
        title="خروج من معاينة الصورة والعودة للسجل (Esc)"
      >
        <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
        <span>خروج ✕</span>
      </button>

      {/* Top Header Controls Bar (WITHOUT the Zoom In and Zoom Out buttons, as requested) */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 border-b border-stone-800/90 pb-2 pt-1 px-1 shrink-0 pl-24 sm:pl-28">
        <div className="flex items-center gap-2 sm:gap-3 truncate">
          {transactionNumber && (
            <span className="px-2 sm:px-2.5 py-1 rounded bg-stone-800 text-amber-300 text-xs font-mono font-bold border border-stone-700 shrink-0">
              العدد: {transactionNumber}
            </span>
          )}
          <span className="px-2 py-0.5 sm:py-1 rounded bg-amber-400 text-stone-950 text-xs font-bold shrink-0">
            {activeAttachment.type}
          </span>
          <div className="truncate hidden xs:block sm:block">
            <h3 className="text-xs sm:text-sm font-bold text-stone-100 truncate max-w-[140px] sm:max-w-md">
              {activeAttachment.name}
            </h3>
          </div>
        </div>

        {/* Action Buttons: (Rotate, Reset, Print, Share, Download) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Zoom Level Indicator & Reset when zoomed or rotated */}
          {(zoom !== 1 || rotation !== 0 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-colors cursor-pointer border border-amber-500/40 shadow-xs"
              title="إعادة ضبط الحجم والدوران إلى الحجم الطبيعي"
            >
              <span>إعادة ضبط ({Math.round(zoom * 100)}%)</span>
            </button>
          )}

          {/* Rotate 90° */}
          <button
            type="button"
            onClick={handleRotate}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer border border-stone-700"
            title="تدوير 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Quick Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer border border-stone-700"
            title="طباعة الوثيقة مباشرة"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Quick Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer border border-stone-700"
            title="مشاركة الوثيقة (واتساب / بريد / رابط)"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors cursor-pointer border border-stone-700"
            title="تحميل الصورة"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">تحميل</span>
          </button>
        </div>
      </div>

      {/* Main Image Stage:
          - Mouse wheel zooms in and out cleanly without scrolling background.
          - On mobile: Pinch-to-zoom with fingers scales the document, and drag moves the view.
          - Double click / Double tap toggles zoom.
      */}
      <div 
        ref={stageRef}
        className={`flex-1 flex items-center justify-center p-1 sm:p-4 overflow-hidden relative select-none ${
          zoom > 1 ? (isMouseDown ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => {
          if (e.target === e.currentTarget && zoom <= 1) {
            handleSafeClose();
          }
        }}
      >
        {/* Right Arrow: in Arabic RTL, right is previous */}
        {attachments.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute right-1.5 sm:right-4 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3.5 rounded-full bg-stone-900/90 hover:bg-stone-800 active:bg-amber-500 active:text-stone-950 text-white border border-stone-700 shadow-2xl transition-all active:scale-90 cursor-pointer"
            title="المرفق السابق (أو اسحب يميناً)"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* The Scaled / Rotated / Translated Document */}
        <div 
          className="flex items-center justify-center max-w-full max-h-full transition-transform ease-out"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom}) rotate(${rotation}deg)`,
            transitionDuration: isMouseDown ? '0ms' : '120ms',
            transformOrigin: 'center center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={previewUrl}
            alt={activeAttachment.name}
            draggable={false}
            className="max-h-[calc(100dvh-140px)] max-w-[calc(100vw-32px)] object-contain rounded-lg shadow-2xl border border-stone-800 bg-white select-none pointer-events-none"
          />
        </div>

        {/* Left Arrow: in Arabic RTL, left is next */}
        {attachments.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute left-1.5 sm:left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3.5 rounded-full bg-stone-900/90 hover:bg-stone-800 active:bg-amber-500 active:text-stone-950 text-white border border-stone-700 shadow-2xl transition-all active:scale-90 cursor-pointer"
            title="المرفق التالي (أو اسحب يساراً)"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
      </div>

      {/* Bottom Footer with Attachments Strip & Info */}
      <div 
        className="border-t border-stone-800/90 pt-2 pb-1.5 px-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400 shrink-0 bg-stone-950/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Attachments Switcher Strip if multiple attachments */}
        {attachments.length > 1 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5">
            <span className="text-[11px] font-bold text-amber-300 ml-1 shrink-0">
              المرفقات ({internalIndex + 1}/{attachments.length}):
            </span>
            {attachments.map((att, idx) => (
              <button
                key={att.id || idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInternalIndex(idx);
                  onIndexChange?.(idx);
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setRotation(0);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 border ${
                  idx === internalIndex
                    ? 'bg-amber-400 text-stone-950 font-bold border-amber-300 shadow-sm scale-105'
                    : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border-stone-700'
                }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span className="truncate max-w-[130px]">{att.name}</span>
                <span className="text-[10px] opacity-75">({idx + 1})</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-stone-200">{activeAttachment.name}</span>
            {activeAttachment.fileSize && <span>• الحجم: {activeAttachment.fileSize}</span>}
            {activeAttachment.uploadDate && <span>• تاريخ الرفع: {activeAttachment.uploadDate}</span>}
          </div>
        )}

        <div className="flex items-center gap-3 text-stone-400 text-[11px]">
          <span className="text-amber-300/90 font-medium">
            💡 التكبير: بعجلة الفارة في الحاسوب أو بأصابع اليد في الهاتف
          </span>
          <span className="hidden sm:inline">نقر مزدوج للتكبير/التصغير السريع • <strong>Esc</strong> للخروج</span>
        </div>
      </div>
    </div>
  );
};
