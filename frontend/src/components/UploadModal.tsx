import { useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { api } from "../lib/api";
import type { SubjectOut } from "../types/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: SubjectOut[];
  defaultSubjectId?: string | null;
  /** Called after a successful upload, right before the modal closes - the
   * caller's own document list refresh (or its existing poll) picks up
   * the new/processing document from there. */
  onUploaded?: () => void;
}

/** The "New Entry" flow: pick a subject + type, then either choose a file
 * or paste a link. Thin UI wrapper around the upload calls DocumentsPage
 * already used inline - the API layer is unchanged. */
export default function UploadModal({ isOpen, onClose, subjects, defaultSubjectId = null, onUploaded }: UploadModalProps) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [subjectId, setSubjectId] = useState<string | null>(defaultSubjectId);
  const [documentType, setDocumentType] = useState<"textbook" | "notes">("textbook");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setLinkUrl("");
    setError(null);
    setUploading(false);
    setMode("file");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      await api.uploadDocument(file, subjectId, documentType);
      onUploaded?.();
      handleClose();
    } catch (e) {
      setError((e as Error).message);
      setUploading(false);
    }
  }

  async function handleLink() {
    if (!linkUrl.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadDocumentFromLink(linkUrl.trim(), subjectId, documentType);
      onUploaded?.();
      handleClose();
    } catch (e) {
      setError((e as Error).message);
      setUploading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Entry">
      <div className="space-y-5">
        <div className="flex gap-2">
          <button
            onClick={() => setMode("file")}
            className={`flex-1 rounded-full py-2 text-label-md font-label-md transition-colors ${
              mode === "file"
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Upload a file
          </button>
          <button
            onClick={() => setMode("link")}
            className={`flex-1 rounded-full py-2 text-label-md font-label-md transition-colors ${
              mode === "link"
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            Add from a link
          </button>
        </div>

        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1.5">Subject</label>
          <select
            value={subjectId ?? ""}
            onChange={(e) => setSubjectId(e.target.value || null)}
            className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
          >
            <option value="">Uncategorized</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-label-md font-label-md text-on-surface-variant mb-1.5">Type</label>
          <div className="flex gap-2">
            {(["textbook", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDocumentType(t)}
                className={`flex-1 rounded-full py-1.5 text-label-md font-label-md capitalize transition-colors border-2 ${
                  documentType === t
                    ? "border-primary text-primary bg-primary/5"
                    : "border-outline-variant text-on-surface-variant"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {mode === "file" ? (
          <label className="block cursor-pointer">
            <div className="border-2 border-dashed border-outline-variant hover:border-primary rounded-xl py-8 text-center transition-colors">
              <p className="font-body-md text-on-surface-variant">
                {uploading ? "Uploading..." : "Click to choose a PDF, DOCX, or TXT file"}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLink()}
              placeholder="https://example.com/textbook-chapter.pdf"
              className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none placeholder-on-surface-variant/60"
            />
            <Button variant="primary" className="w-full" disabled={uploading || !linkUrl.trim()} onClick={handleLink}>
              {uploading ? "Fetching..." : "Add"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}
