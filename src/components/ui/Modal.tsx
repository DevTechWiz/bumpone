import React, { useEffect, ReactNode } from 'react';
import { X, ArrowLeft } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  zIndex?: string;
  hasBackdrop?: boolean;
  bodyClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onBack,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
  zIndex = 'z-50',
  hasBackdrop = true,
  bodyClassName,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4 pointer-events-none`}>
      {/* Backdrop with dark grey blur (only if not layered over an already blurred backdrop) */}
      {hasBackdrop && (
        <div
          className="fixed inset-0 bg-[#0d0e12]/85 backdrop-blur-md transition-opacity duration-200 pointer-events-auto"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidthStyles[maxWidth]} bg-[#18191d]/95 backdrop-blur-xl border border-white/[0.14] rounded-2xl shadow-2xl shadow-black/90 overflow-hidden z-10 pointer-events-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}
      >
        {/* Header (conditionally rendered only if title, subtitle, or back button is present) */}
        {title || subtitle || onBack ? (
          <div className="flex items-start justify-between p-5 sm:p-6 border-b border-white/[0.08] shrink-0">
            <div className="flex items-start gap-3">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-0.5 rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer"
                  aria-label="Back"
                  title="Back to profile card"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                {title && (
                  <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Content Body */}
        <div
          className={
            bodyClassName
              ? bodyClassName
              : `p-5 sm:p-6 max-h-[85vh] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 hover:[&::-webkit-scrollbar-thumb]:bg-white/30 [&::-webkit-scrollbar-thumb]:rounded-full space-y-4`
          }
        >
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 sm:p-5 bg-black/40 border-t border-white/[0.08] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
