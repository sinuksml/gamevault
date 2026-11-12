import { useEffect, useRef, type ReactNode } from "react";

/** A modal built on the native dialog element: focus trapping, Escape and the backdrop come from the browser. */
export function Dialog({ open, onClose, label, className, children }: { open: boolean; onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} aria-label={label} onClose={onClose}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      {open && children}
    </dialog>
  );
}
