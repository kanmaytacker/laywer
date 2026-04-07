export default function Modal({ open, title, onClose, children, width = 'max-w-2xl' }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 pt-8 backdrop-blur-sm">
      <div
        className={`my-4 flex max-h-[calc(100vh-4rem)] w-full ${width} flex-col overflow-hidden rounded-2xl border border-[#2a313d] bg-[#101720] shadow-[0_30px_80px_rgba(0,0,0,0.45)]`}
      >
        <div className="flex items-center justify-between border-b border-[#242c38] px-5 py-4">
          <h3 className="text-lg font-semibold tracking-tight text-[#f1f6fd]">{title}</h3>
          <button
            className="rounded-lg px-2 py-1 text-sm text-[#98a4b6] transition hover:bg-[#192230] hover:text-[#e5ecf6]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
