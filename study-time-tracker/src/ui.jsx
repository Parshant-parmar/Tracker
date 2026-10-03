import { useEffect, useId, useRef } from 'react';
import { Link } from './router.jsx';

export function Button({ variant = 'secondary', size, className = '', children, ...rest }) {
  return <button type="button" className={`btn btn-${variant}${size ? ` btn-${size}` : ''} ${className}`} {...rest}>{children}</button>;
}

// Native <dialog>: focus trap, Esc to close and aria-modal come from the platform.
export function Modal({ title, onClose, children, actions, narrow }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      d.querySelector('[data-autofocus]')?.focus();
    }
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${narrow ? ' modal-narrow' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="modal-body">
        <h2 id={titleId} className="modal-title">{title}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </dialog>
  );
}

export function Confirm({ title, children, cancelLabel = 'Cancel', confirmLabel, danger, busy, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel} actions={<>
      <Button data-autofocus onClick={onCancel}>{cancelLabel}</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
    </>}>
      {children}
    </Modal>
  );
}

export function Field({ label, hint, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {typeof children === 'function' ? children(id) : children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Page({ title, subtitle, back, children, actions }) {
  return (
    <main className="page" id="main">
      <header className="page-head">
        {back && <Link className="back" to={back.to}>{back.label}</Link>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {actions}
      </header>
      {children}
    </main>
  );
}

export function Stat({ label, value }) {
  return <div className="stat"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function Segmented({ legend, value, onChange, options }) {
  return (
    <fieldset className="segmented">
      <legend>{legend}</legend>
      <div>
        {options.map((o) => (
          <label key={o.value} className={value === o.value ? 'on' : ''}>
            <input type="radio" name={legend} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
