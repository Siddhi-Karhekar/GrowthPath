import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NoteOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Button from "../components/Button";

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
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 my-3 font-body-lg text-body-lg text-on-surface">
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
        <h2 key={i} className="font-headline-md text-headline-md text-on-background mt-7 mb-2">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1 key={i} className="font-headline-lg text-headline-lg text-on-background mt-2 mb-3">
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
        <p
          key={i}
          className="font-body-lg text-body-lg text-on-surface my-2"
          dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }}
        />
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

  if (loading) return <p className="text-on-surface-variant font-body-md">Loading...</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-headline-lg text-headline-lg text-on-background">Notes</h2>
        {note && (
          <div className="flex items-center gap-5">
            <button onClick={() => window.print()} className="font-label-md text-label-md text-on-surface-variant hover:text-primary">
              Download as PDF
            </button>
            <button onClick={handleGenerate} disabled={generating} className="font-label-md text-label-md text-primary disabled:opacity-50">
              {generating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
        )}
      </div>
      <p className="font-body-md text-on-surface-variant mb-6">
        Condensed, source-grounded notes generated from this document - a revision aid, not a substitute for the original material.
      </p>

      {error && <p className="text-sm text-error mb-4">{error}</p>}

      {!note ? (
        <Button variant="primary" onClick={handleGenerate} disabled={generating}>
          {generating ? "Writing notes..." : "Generate notes"}
        </Button>
      ) : (
        <JournalCard hoverable={false} id="printable-content" className="p-8">
          <h1 className="hidden print:block font-headline-md text-headline-md text-on-background mb-1">{note.title}</h1>
          {note.created_at && (
            <p className="hidden print:block font-caption text-caption text-on-surface-variant mb-4">
              GrowthPath notes - generated {new Date(note.created_at).toLocaleDateString()}
            </p>
          )}
          {renderMarkdown(note.content)}
        </JournalCard>
      )}
    </div>
  );
}
