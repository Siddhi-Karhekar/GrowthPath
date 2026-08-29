import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ConceptCandidateOut, ConceptGraphOut, ConceptOut, RelationType, SubjectOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Chip from "../components/Chip";
import ProgressBar from "../components/ProgressBar";
import Button from "../components/Button";

// Same 0.7 "Strong" threshold masteryColor() below uses - a concept counts
// as mastered enough to unlock what comes after it.
const MASTERED_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// A small, dependency-free force-directed layout (Fruchterman-Reingold
// style: nodes repel each other, edges pull connected nodes together,
// everything is pulled gently toward the center). Subject graphs here are
// small (a few dozen concepts at most), so a synchronous O(n^2) layout over
// a couple hundred iterations is instant - no graph-visualization library
// needed for that.
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

function computeLayout(nodeIds: string[], edges: { source: string; target: string }[], width: number, height: number): Record<string, Point> {
  const n = nodeIds.length;
  if (n === 0) return {};

  const positions: Record<string, Point> = {};
  const angleStep = (2 * Math.PI) / n;
  nodeIds.forEach((id, i) => {
    positions[id] = {
      x: width / 2 + Math.cos(i * angleStep) * Math.min(width, height) * 0.32,
      y: height / 2 + Math.sin(i * angleStep) * Math.min(width, height) * 0.32,
    };
  });
  if (n === 1) return positions;

  const k = Math.sqrt((width * height) / n) * 0.9;
  const iterations = 220;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = Math.max(1, 24 * (1 - iter / iterations));
    const forces: Record<string, Point> = {};
    nodeIds.forEach((id) => (forces[id] = { x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        let dx = positions[a].x - positions[b].x;
        let dy = positions[a].y - positions[b].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        forces[a].x += dx;
        forces[a].y += dy;
        forces[b].x -= dx;
        forces[b].y -= dy;
      }
    }

    edges.forEach(({ source, target }) => {
      if (!positions[source] || !positions[target]) return;
      let dx = positions[source].x - positions[target].x;
      let dy = positions[source].y - positions[target].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      forces[source].x -= dx;
      forces[source].y -= dy;
      forces[target].x += dx;
      forces[target].y += dy;
    });

    nodeIds.forEach((id) => {
      const p = positions[id];
      const f = forces[id];
      f.x += (width / 2 - p.x) * 0.01;
      f.y += (height / 2 - p.y) * 0.01;
      const fLen = Math.sqrt(f.x * f.x + f.y * f.y) || 0.01;
      const limited = Math.min(fLen, temp);
      p.x += (f.x / fLen) * limited;
      p.y += (f.y / fLen) * limited;
      p.x = Math.max(48, Math.min(width - 48, p.x));
      p.y = Math.max(48, Math.min(height - 48, p.y));
    });
  }

  return positions;
}

// Mastery -> Serene Scholar palette colors (literal hex, not Tailwind
// classes/CSS vars, since these feed SVG fill/stroke attributes directly).
// Same 0.45/0.7 thresholds the Growth dashboard's risk flags use, so the
// two views never disagree with each other.
function masteryColor(mastery: number | null): { fill: string; stroke: string; label: string } {
  if (mastery === null) return { fill: "#eae8e4", stroke: "#6d7a77", label: "Not yet tested" };
  if (mastery < 0.45) return { fill: "#ffdad6", stroke: "#ba1a1a", label: "Needs attention" };
  if (mastery < MASTERED_THRESHOLD) return { fill: "#f9e287", stroke: "#6e5e0d", label: "Getting there" };
  return { fill: "#89f5e7", stroke: "#00685f", label: "Strong" };
}

const relationStyle: Record<RelationType, { dash?: string; color: string; label: string; shortLabel: string; arrow: boolean }> = {
  prerequisite: { color: "#00685f", label: "Prerequisite", shortLabel: "prerequisite", arrow: true },
  related: { dash: "5 4", color: "#6d7a77", label: "Related", shortLabel: "related", arrow: false },
  part_of: { dash: "1 4", color: "#006686", label: "Part of", shortLabel: "part of", arrow: false },
  contrasts_with: { dash: "8 3 2 3", color: "#6e5e0d", label: "Often confused / contrasts with", shortLabel: "contrast", arrow: false },
};

const WIDTH = 780;
const HEIGHT = 560;

export default function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<SubjectOut[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>("");
  const [graph, setGraph] = useState<ConceptGraphOut | null>(null);
  const [candidates, setCandidates] = useState<ConceptCandidateOut[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);

  useEffect(() => {
    api.listSubjects().then((subs) => {
      setSubjects(subs);
      if (subs.length > 0) setActiveSubject(subs[0].id);
    }).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!activeSubject) return;
    setError(null);
    api.getConceptGraph(activeSubject).then(setGraph).catch((e) => setError((e as Error).message));
    api.listConceptCandidates(activeSubject).then(setCandidates).catch(() => {});
  }, [activeSubject]);

  async function handleBuild() {
    if (!activeSubject) return;
    setBuilding(true);
    setError(null);
    try {
      const result = await api.buildConceptGraph(activeSubject);
      setGraph(result);
      setCandidates(await api.listConceptCandidates(activeSubject));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  async function handleResolve(candidateId: string, resolution: "confirm_same" | "reject_as_different") {
    try {
      await api.resolveConceptCandidate(candidateId, resolution);
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      if (activeSubject) setGraph(await api.getConceptGraph(activeSubject));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const positions = useMemo(() => {
    if (!graph) return {};
    return computeLayout(
      graph.concepts.map((c) => c.id),
      graph.edges.map((e) => ({ source: e.source_concept_id, target: e.target_concept_id })),
      WIDTH,
      HEIGHT
    );
  }, [graph]);

  // "What to learn next": concepts that aren't mastered yet but whose
  // prerequisites (walked via "prerequisite" edges) all are - pure graph
  // logic over data already loaded, no extra LLM call needed.
  const learnNext = useMemo(() => {
    if (!graph) return [];
    const masteryById = new Map(graph.concepts.map((c) => [c.id, c.mastery]));
    const isMastered = (m: number | null | undefined) => m != null && m >= MASTERED_THRESHOLD;

    const prereqsByTarget = new Map<string, string[]>();
    graph.edges.forEach((e) => {
      if (e.relation_type !== "prerequisite") return;
      const list = prereqsByTarget.get(e.target_concept_id) ?? [];
      list.push(e.source_concept_id);
      prereqsByTarget.set(e.target_concept_id, list);
    });

    return graph.concepts
      .filter((c) => !isMastered(c.mastery))
      .filter((c) => {
        const prereqs = prereqsByTarget.get(c.id) ?? [];
        return prereqs.length === 0 || prereqs.every((pid) => isMastered(masteryById.get(pid)));
      })
      .sort((a, b) => {
        const aHasPrereqs = (prereqsByTarget.get(a.id) ?? []).length > 0 ? 0 : 1;
        const bHasPrereqs = (prereqsByTarget.get(b.id) ?? []).length > 0 ? 0 : 1;
        if (aHasPrereqs !== bHasPrereqs) return aHasPrereqs - bHasPrereqs;
        return (a.mastery ?? -1) - (b.mastery ?? -1);
      })
      .slice(0, 3);
  }, [graph]);

  const selectedConceptData: ConceptOut | null =
    (graph && selectedConcept && graph.concepts.find((c) => c.id === selectedConcept)) || null;

  // Derived relation-type chips for the side panel - real graph data (one
  // chip per relation type connected to this concept, with a count),
  // rather than fabricated free-text tags.
  const relationCounts = useMemo(() => {
    if (!graph || !selectedConcept) return [];
    const counts = { prerequisite: 0, related: 0, part_of: 0, contrasts_with: 0 } as Record<RelationType, number>;
    graph.edges.forEach((e) => {
      if (e.source_concept_id === selectedConcept || e.target_concept_id === selectedConcept) {
        counts[e.relation_type] += 1;
      }
    });
    return (Object.keys(counts) as RelationType[])
      .filter((r) => counts[r] > 0)
      .map((r) => ({ relation: r, count: counts[r] }));
  }, [graph, selectedConcept]);

  function practiceConcept(canonicalName: string) {
    if (!activeSubject) return;
    navigate(`/tests/new?subject=${activeSubject}&topic=${encodeURIComponent(canonicalName)}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background mb-2">Knowledge Graph</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            How the topics in a subject connect into a learning flow. Colors show your mastery of each
            concept; line style shows how two concepts relate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {subjects.length > 0 && (
            <select
              value={activeSubject}
              onChange={(e) => setActiveSubject(e.target.value)}
              className="bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <Button variant="primary" onClick={handleBuild} disabled={building || !activeSubject}>
            {building ? "Building..." : "Build / update graph"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {subjects.length === 0 ? (
        <p className="text-on-surface-variant font-body-md">Create a subject folder and add some material to it first.</p>
      ) : !graph || graph.concepts.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border-2 border-dashed border-outline-variant rounded-xl">
          No graph yet for this subject. Upload some material, then click "Build / update graph".
        </div>
      ) : (
        <div className="flex gap-6 flex-wrap lg:flex-nowrap">
          <JournalCard hoverable={false} className="p-3 overflow-x-auto">
            <svg width={WIDTH} height={HEIGHT} className="max-w-full">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#00685f" />
                </marker>
              </defs>

              {graph.edges.map((edge) => {
                const from = positions[edge.source_concept_id];
                const to = positions[edge.target_concept_id];
                if (!from || !to) return null;
                const style = relationStyle[edge.relation_type];
                const isHighlighted =
                  hoveredEdge === edge.id ||
                  (selectedConcept !== null &&
                    (edge.source_concept_id === selectedConcept || edge.target_concept_id === selectedConcept));
                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={style.color}
                    strokeWidth={isHighlighted ? 2.5 : 1.3}
                    strokeOpacity={selectedConcept && !isHighlighted ? 0.15 : isHighlighted ? 0.95 : 0.45}
                    strokeDasharray={style.dash}
                    markerEnd={style.arrow ? "url(#arrow)" : undefined}
                    onMouseEnter={() => setHoveredEdge(edge.id)}
                    onMouseLeave={() => setHoveredEdge(null)}
                  >
                    <title>
                      {style.label}
                      {edge.rationale ? ` — ${edge.rationale}` : ""}
                    </title>
                  </line>
                );
              })}

              {graph.concepts.map((concept) => {
                const p = positions[concept.id];
                if (!p) return null;
                const colors = masteryColor(concept.mastery);
                const dimmed = selectedConcept !== null && selectedConcept !== concept.id &&
                  !graph.edges.some(
                    (e) =>
                      (e.source_concept_id === selectedConcept && e.target_concept_id === concept.id) ||
                      (e.target_concept_id === selectedConcept && e.source_concept_id === concept.id)
                  );
                return (
                  <g
                    key={concept.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    opacity={dimmed ? 0.35 : 1}
                    className="cursor-pointer"
                    onClick={() => setSelectedConcept((prev) => (prev === concept.id ? null : concept.id))}
                  >
                    <circle r={selectedConcept === concept.id ? 18 : 16} fill={colors.fill} stroke={colors.stroke} strokeWidth={2} />
                    <text
                      y={32}
                      textAnchor="middle"
                      fontSize={11}
                      fontFamily="Hanken Grotesk, sans-serif"
                      className="fill-on-surface-variant select-none"
                      style={{ fontWeight: selectedConcept === concept.id ? 700 : 500 }}
                    >
                      {concept.canonical_name.length > 20 ? `${concept.canonical_name.slice(0, 18)}...` : concept.canonical_name}
                    </text>
                    <title>
                      {concept.canonical_name}
                      {concept.mastery !== null ? ` — ${Math.round(concept.mastery * 100)}% mastery` : " — not yet tested"}
                    </title>
                  </g>
                );
              })}
            </svg>
          </JournalCard>

          <div className="w-full lg:w-72 shrink-0 space-y-5">
            {selectedConceptData && (
              <JournalCard hoverable={false} className="p-5">
                <div className="flex items-center gap-2 text-secondary font-label-md text-label-md mb-3">
                  <span>Currently Exploring</span>
                </div>
                <h2 className="font-headline-md text-title-lg text-on-surface mb-2">{selectedConceptData.canonical_name}</h2>
                {selectedConceptData.mastery !== null ? (
                  <div className="flex items-center gap-3 mb-4">
                    <ProgressBar value={selectedConceptData.mastery * 100} className="flex-1" />
                    <span className="font-label-md text-label-md text-primary shrink-0">
                      {Math.round(selectedConceptData.mastery * 100)}%
                    </span>
                  </div>
                ) : (
                  <p className="font-caption text-caption text-on-surface-variant mb-4">Not yet tested</p>
                )}

                {selectedConceptData.description && (
                  <p className="font-body-md text-body-md text-on-surface-variant mb-4">{selectedConceptData.description}</p>
                )}

                {relationCounts.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-5">
                    {relationCounts.map(({ relation, count }) => (
                      <Chip key={relation} tone="secondary">
                        {count} {relationStyle[relation].shortLabel}
                        {count === 1 ? "" : "s"}
                      </Chip>
                    ))}
                  </div>
                )}

                {selectedConceptData.source_documents.length > 0 && (
                  <div className="space-y-3 mb-5">
                    <h3 className="font-title-lg text-body-lg text-on-surface-variant">Recent Insights</h3>
                    {selectedConceptData.source_documents.map((doc) => (
                      <Link
                        key={doc.document_id}
                        to={`/notes/${doc.document_id}`}
                        className="stacked-paper p-4 block hover:border-primary transition-colors"
                      >
                        <p className="font-body-md text-on-surface truncate">{doc.filename}</p>
                        <p className="font-caption text-caption text-on-surface-variant mt-1">
                          {doc.note_id ? "Generated notes available →" : "Open document notes →"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}

                <Button variant="primary" className="w-full" onClick={() => practiceConcept(selectedConceptData.canonical_name)}>
                  Practice this concept
                </Button>
              </JournalCard>
            )}

            {learnNext.length > 0 && (
              <JournalCard hoverable={false} className="p-5">
                <h2 className="font-title-lg text-title-lg text-secondary mb-1">What to learn next</h2>
                <p className="font-caption text-caption text-on-surface-variant mb-3">
                  Concepts you haven't mastered yet, whose prerequisites you have.
                </p>
                <div className="space-y-2">
                  {learnNext.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <span className="font-body-md text-on-surface truncate">{c.canonical_name}</span>
                      <button
                        onClick={() => practiceConcept(c.canonical_name)}
                        className="shrink-0 font-label-md text-label-md text-primary hover:opacity-75"
                      >
                        Practice
                      </button>
                    </div>
                  ))}
                </div>
              </JournalCard>
            )}

            <JournalCard hoverable={false} className="p-5">
              <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide mb-3">Mastery</h2>
              <div className="space-y-2">
                {([null, 0.3, 0.6, 0.85] as (number | null)[]).map((m) => {
                  const c = masteryColor(m);
                  return (
                    <div key={String(m)} className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: c.fill, border: `2px solid ${c.stroke}` }} />
                      <span className="font-body-md text-caption text-on-surface-variant">{c.label}</span>
                    </div>
                  );
                })}
              </div>
              <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide mt-5 mb-3">Connections</h2>
              <div className="space-y-2">
                {(Object.keys(relationStyle) as RelationType[]).map((r) => {
                  const s = relationStyle[r];
                  return (
                    <div key={r} className="flex items-center gap-2">
                      <svg width="24" height="10">
                        <line x1="0" y1="5" x2="24" y2="5" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
                      </svg>
                      <span className="font-body-md text-caption text-on-surface-variant">{s.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="font-caption text-caption text-on-surface-variant mt-4">Click a node to highlight its connections. Hover a line or node for details.</p>
            </JournalCard>

            {candidates.length > 0 && (
              <JournalCard hoverable={false} className="p-5">
                <h2 className="font-label-md text-label-md text-tertiary uppercase tracking-wide mb-2">Needs your confirmation</h2>
                <p className="font-caption text-caption text-on-surface-variant mb-3">
                  These terms were too ambiguous to auto-resolve - is each one the same concept as the match found, or a different one?
                </p>
                <div className="space-y-3">
                  {candidates.map((c) => (
                    <div key={c.id} className="border-t border-outline-variant/50 pt-3 first:border-0 first:pt-0">
                      <p className="font-body-md text-on-surface">
                        Is <span className="font-semibold">"{c.new_alias}"</span> the same as{" "}
                        <span className="font-semibold">"{c.candidate_concept_name}"</span>?
                      </p>
                      {c.llm_rationale && <p className="font-caption text-caption text-on-surface-variant mt-0.5">{c.llm_rationale}</p>}
                      <div className="flex gap-4 mt-2">
                        <button onClick={() => handleResolve(c.id, "confirm_same")} className="font-label-md text-label-md text-primary hover:opacity-75">
                          Same concept
                        </button>
                        <button onClick={() => handleResolve(c.id, "reject_as_different")} className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface">
                          Different concept
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </JournalCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
