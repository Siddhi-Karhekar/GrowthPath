import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NoteOut } from "../types/api";

// Very small, dependency-free markdown-ish renderer: handles the subset the
// notes-generation prompt actually produces (##/### headings, **bold**,
// "- " bullets, blank-line paragraphs) without pulling in a markdown
// library for one page.
function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 my-2">
        {listItems.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2 key={i} className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1 key={i} className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-2 mb-3">
          {trimmed.slice(2)}
        </h1>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed.length === 0) {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={i} className="text-sm text-slate-600 dark:text-slate-400 my-1.5" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />
      );
    }
  });
  flushList();
  return blocks;
}

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export default function NotesPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [note, setNote] = useState<NoteOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    api
      .getLatestNotes(documentId)
      .then(setNote)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [documentId]);

  async function handleGenerate() {
    if (!documentId) return;
    setGenerating(true);
    setError(null);
    try {
      setNote(await api.generateNotes(documentId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Notes</h1>
        {note && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.print()}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
            >
              Download as PDF
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-sm text-teal-600 hover:text-teal-500 font-medium disabled:opacity-50"
            >
              {generating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Condensed, source-grounded notes generated from this document - a revision aid, not a substitute for the original material.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!note ? (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 hover:to-sky-400 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm shadow-teal-500/25"
        >
          {generating ? "Writing notes..." : "Generate notes"}
        </button>
      ) : (
        <div id="printable-content" className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-6 shadow-sm shadow-teal-500/5">
          <h1 className="hidden print:block text-xl font-semibold text-slate-900 mb-1">{note.title}</h1>
          {note.created_at && (
            <p className="hidden print:block text-xs text-slate-400 mb-4">
              GrowthPath notes - generated {new Date(note.created_at).toLocaleDateString()}
            </p>
          )}
          {renderMarkdown(note.content)}
        </div>
      )}
    </div>
  );
}
