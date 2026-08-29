import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DocumentOut, SubjectOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Chip from "../components/Chip";
import Modal from "../components/Modal";
import Button from "../components/Button";
import { formatRelativeTime } from "../lib/format";

const UNCATEGORIZED = "__uncategorized__";

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M20 20L16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const TextbookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 5.5C4 4.67 4.67 4 5.5 4H14L20 8V19.5C20 20.33 19.33 21 18.5 21H5.5C4.67 21 4 20.33 4 19.5V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path d="M14 4V8H20" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 12.5H16M8 16H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const NotesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M5 4.5C5 3.67 5.67 3 6.5 3H17.5C18.33 3 19 3.67 19 4.5V19.5C19 20.33 18.33 21 17.5 21H6.5C5.67 21 5 20.33 5 19.5V4.5Z" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.5 3V21" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8.5H16M12 12H16M12 15.5H14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const KebabIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="19" r="1.6" />
  </svg>
);

const SyncIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin">
    <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

function fileKindLabel(doc: DocumentOut): string {
  if (doc.source_type === "link") return "Web Link";
  const ext = doc.filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "Docx";
  return "Text";
}

export default function DocumentsPage() {
  const [subjects, setSubjects] = useState<SubjectOut[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null); // null = "All"
  const [documents, setDocuments] = useState<DocumentOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocumentOut | null>(null);
  const [deleting, setDeleting] = useState(false);
  const reuploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function refreshSubjects() {
    try {
      setSubjects(await api.listSubjects());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshDocuments() {
    try {
      // activeSubject === UNCATEGORIZED isn't a real subject id - filter client-side for that case.
      const all = await api.listDocuments(activeSubject && activeSubject !== UNCATEGORIZED ? activeSubject : undefined);
      setDocuments(activeSubject === UNCATEGORIZED ? all.filter((d) => !d.subject_id) : all);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refreshSubjects();
  }, []);

  useEffect(() => {
    refreshDocuments();
    const interval = setInterval(refreshDocuments, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubject]);

  useEffect(() => {
    function onClickOutside() {
      setOpenMenuId(null);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  async function handleCreateSubject() {
    if (!newSubjectName.trim()) return;
    try {
      await api.createSubject(newSubjectName.trim());
      setNewSubjectName("");
      setShowNewSubject(false);
      await refreshSubjects();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleReupload(documentId: string, file: File) {
    setError(null);
    try {
      await api.reuploadDocument(documentId, file);
      await refreshDocuments();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!docToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteDocument(docToDelete.id);
      setDocToDelete(null);
      await refreshDocuments();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const visibleDocuments = documents.filter((d) => d.filename.toLowerCase().includes(query.trim().toLowerCase()));

  const subjectChips: { id: string | null; label: string }[] = [
    { id: null, label: "All Subjects" },
    ...subjects.map((s) => ({ id: s.id, label: s.name })),
    { id: UNCATEGORIZED, label: "Uncategorized" },
  ];

  return (
    <div className="space-y-10">
      <div className="relative max-w-md">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
          <SearchIcon />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library..."
          className="w-full bg-surface-container-low text-on-surface border-0 border-b-2 border-transparent focus:border-primary focus:ring-0 pl-10 pr-4 py-2.5 rounded-t-md font-body-md outline-none placeholder-on-surface-variant/70"
        />
      </div>

      <div className="flex justify-between items-end gap-6 flex-wrap">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background mb-2">My Library</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            All your study materials in one cozy space.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {subjectChips.map((s) => (
            <button key={s.id ?? "all"} onClick={() => setActiveSubject(s.id)}>
              <Chip tone={activeSubject === s.id ? "primary" : "neutral"}>{s.label}</Chip>
            </button>
          ))}
          {showNewSubject ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                autoFocus
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSubject()}
                onBlur={() => !newSubjectName && setShowNewSubject(false)}
                placeholder="Subject name"
                className="w-32 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 text-caption font-caption focus:outline-none focus:border-primary"
              />
              <button onClick={handleCreateSubject} className="text-caption font-caption text-primary font-semibold">
                Add
              </button>
            </span>
          ) : (
            <button onClick={() => setShowNewSubject(true)}>
              <Chip tone="neutral">+ New subject</Chip>
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {visibleDocuments.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border-2 border-dashed border-outline-variant rounded-xl">
          {documents.length === 0
            ? "No documents here yet. Use “New Entry” in the sidebar to upload a PDF, DOCX, or TXT file, or add one from a link."
            : "No documents match your search."}
        </div>
      ) : (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8 pb-12">
          {visibleDocuments.map((doc) => (
            <JournalCard key={doc.id} className="p-6 break-inside-avoid flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  {doc.document_type === "notes" ? <NotesIcon /> : <TextbookIcon />}
                </div>
                {doc.status === "ready" && <Chip tone="primary">Ready</Chip>}
                {doc.status === "processing" && (
                  <Chip tone="neutral" icon={<SyncIcon />}>
                    Processing
                  </Chip>
                )}
                {doc.status === "failed" && <Chip tone="error">Failed</Chip>}
              </div>

              <div>
                <h3 className="font-title-lg text-title-lg text-on-background mb-1 break-words">
                  {doc.filename}
                  {doc.version > 1 && <span className="text-caption text-on-surface-variant font-caption ml-1.5">v{doc.version}</span>}
                </h3>
                <p className="font-body-md text-caption text-on-surface-variant">
                  {doc.status === "processing" && "Added just now"}
                  {doc.status === "failed" && "Processing failed - try replacing the file."}
                  {doc.status === "ready" &&
                    `${doc.page_count ? `${doc.page_count} page(s) · ` : ""}Last updated ${formatRelativeTime(doc.updated_at ?? doc.created_at)}`}
                </p>
              </div>

              <div className="mt-auto pt-4 border-t-[1.5px] border-surface-variant flex justify-between items-center relative">
                <span className="font-caption text-on-surface-variant">{fileKindLabel(doc)}</span>

                {doc.status === "ready" && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId((id) => (id === doc.id ? null : doc.id));
                      }}
                      className="text-on-surface-variant hover:text-primary transition-colors"
                      aria-label="Document actions"
                    >
                      <KebabIcon />
                    </button>
                    {openMenuId === doc.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 bottom-full mb-2 journal-card static-card p-1.5 w-40 z-10 shadow-lg"
                      >
                        <Link
                          to={`/tests/new?document=${doc.id}`}
                          className="block px-3 py-2 rounded-md text-label-md font-label-md text-on-surface hover:bg-surface-container-high"
                        >
                          Take a test
                        </Link>
                        <Link
                          to={`/study-guide/${doc.id}`}
                          className="block px-3 py-2 rounded-md text-label-md font-label-md text-on-surface hover:bg-surface-container-high"
                        >
                          Study guide
                        </Link>
                        <Link
                          to={`/notes/${doc.id}`}
                          className="block px-3 py-2 rounded-md text-label-md font-label-md text-on-surface hover:bg-surface-container-high"
                        >
                          Notes
                        </Link>
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            reuploadRefs.current[doc.id]?.click();
                          }}
                          className="block w-full text-left px-3 py-2 rounded-md text-label-md font-label-md text-on-surface-variant hover:bg-surface-container-high"
                        >
                          Replace
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            setDocToDelete(doc);
                          }}
                          className="block w-full text-left px-3 py-2 rounded-md text-label-md font-label-md text-error hover:bg-error-container"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                    <input
                      ref={(el) => {
                        reuploadRefs.current[doc.id] = el;
                      }}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleReupload(doc.id, e.target.files[0])}
                    />
                  </>
                )}
              </div>
            </JournalCard>
          ))}
        </div>
      )}

      <Modal isOpen={!!docToDelete} onClose={() => !deleting && setDocToDelete(null)} title="Delete this document?">
        <p className="font-body-md text-body-md text-on-surface-variant mb-2">
          {"This permanently deletes "}
          <span className="font-semibold text-on-surface">{docToDelete?.filename}</span>
          {" and cannot be undone."}
        </p>
        <p className="font-body-md text-body-md text-error mb-6">
          Every test, attempt, and score generated from this document will be permanently deleted too. Any notes
          you generated from it will be kept, just unlinked from this file.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDocToDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} disabled={deleting} className="!bg-error !text-on-error">
            {deleting ? "Deleting..." : "Delete permanently"}
          </Button>
        </div>
      </Modal>

    </div>
  );
}
