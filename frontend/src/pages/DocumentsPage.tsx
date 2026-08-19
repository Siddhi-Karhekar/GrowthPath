import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DocumentOut, SubjectOut } from "../types/api";

const UNCATEGORIZED = "__uncategorized__";

export default function DocumentsPage() {
  const [subjects, setSubjects] = useState<SubjectOut[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null); // null = "All"
  const [documents, setDocuments] = useState<DocumentOut[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [showNewSubject, setShowNewSubject] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const subjectId = activeSubject && activeSubject !== UNCATEGORIZED ? activeSubject : undefined;
      await api.uploadDocument(file, subjectId);
      await refreshDocuments();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  return (
    <div className="flex gap-8">
      <aside className="w-48 shrink-0">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Subjects</h2>
        <nav className="space-y-1">
          <button
            onClick={() => setActiveSubject(null)}
            className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-sm ${
              activeSubject === null ? "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-teal-50/60 dark:hover:bg-teal-950/30"
            }`}
          >
            All documents
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSubject(s.id)}
              className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-sm truncate ${
                activeSubject === s.id ? "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-teal-50/60 dark:hover:bg-teal-950/30"
              }`}
            >
              {s.name}
            </button>
          ))}
          <button
            onClick={() => setActiveSubject(UNCATEGORIZED)}
            className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-sm ${
              activeSubject === UNCATEGORIZED ? "bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-teal-50/60 dark:hover:bg-teal-950/30"
            }`}
          >
            Uncategorized
          </button>
        </nav>

        {showNewSubject ? (
          <div className="mt-3 space-y-1.5">
            <input
              autoFocus
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSubject()}
              placeholder="Subject name"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <div className="flex gap-1.5">
              <button onClick={handleCreateSubject} className="text-xs text-teal-600 font-medium">Add</button>
              <button onClick={() => setShowNewSubject(false)} className="text-xs text-slate-400">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewSubject(true)}
            className="mt-3 text-xs text-teal-600 hover:text-teal-500 font-medium"
          >
            + New subject
          </button>
        )}
      </aside>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My Documents</h1>
            <p className="text-sm text-slate-500 mt-1">
              Upload your notes or textbook chapters - GrowthPath turns them into tests and study guides.
            </p>
          </div>
          <label className="cursor-pointer rounded-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 hover:to-sky-400 text-white text-sm font-medium px-4 py-2.5 shadow-sm shadow-teal-500/25">
            {uploading ? "Uploading..." : "Upload document"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {documents.length === 0 ? (
          <div className="text-center py-16 text-slate-400 border border-dashed border-teal-200 dark:border-teal-900/50 rounded-2xl">
            No documents here yet. Upload a PDF, DOCX, or TXT file to get started.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl px-4 py-3.5 gap-4 shadow-sm shadow-teal-500/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {doc.filename} {doc.version > 1 && <span className="text-xs text-slate-400">v{doc.version}</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {doc.status === "processing" && "Processing..."}
                    {doc.status === "failed" && "Processing failed - try replacing the file."}
                    {doc.status === "ready" && `${doc.page_count ?? "?"} page(s) - ready`}
                  </p>
                </div>
                {doc.status === "ready" && (
                  <div className="flex items-center gap-3 shrink-0">
                    <Link to={`/tests/new?document=${doc.id}`} className="text-sm text-teal-600 hover:text-teal-500 font-medium">
                      Take a test
                    </Link>
                    <Link to={`/study-guide/${doc.id}`} className="text-sm text-teal-600 hover:text-teal-500 font-medium">
                      Study guide
                    </Link>
                    <button
                      onClick={() => reuploadRefs.current[doc.id]?.click()}
                      className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Replace
                    </button>
                    <input
                      ref={(el) => { reuploadRefs.current[doc.id] = el; }}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleReupload(doc.id, e.target.files[0])}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
