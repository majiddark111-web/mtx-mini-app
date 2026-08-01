import type { PropsWithChildren } from 'react';

interface ModalProps extends PropsWithChildren { title: string; onClose: () => void; }
export function Modal({ title, onClose, children }: ModalProps) {
  return <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header className="modal-header"><h2>{title}</h2><button className="button ghost" type="button" onClick={onClose}>Close</button></header>
      {children}
    </section>
  </div>;
}
