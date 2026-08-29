import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import DocumentsPage from "./pages/DocumentsPage";
import TestConfigPage from "./pages/TestConfigPage";
import TestTakingPage from "./pages/TestTakingPage";
import ResultsPage from "./pages/ResultsPage";
import ProgressPage from "./pages/ProgressPage";
import StudyGuidePage from "./pages/StudyGuidePage";
import NotesPage from "./pages/NotesPage";
import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";

export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <BrowserRouter>
          <Routes>
            {/* Test-taking is intentionally outside the sidebar Layout - a
                distraction-free, full-bleed focus screen while a test is
                in progress, matching the "Taking a Test" design. */}
            <Route path="/tests/:testId/take" element={<TestTakingPage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<DocumentsPage />} />
              <Route path="/tests/new" element={<TestConfigPage />} />
              <Route path="/attempts/:attemptId/results" element={<ResultsPage />} />
              <Route path="/study-guide/:documentId" element={<StudyGuidePage />} />
              <Route path="/notes/:documentId" element={<NotesPage />} />
              <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="/progress" element={<ProgressPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProtectedRoute>
    </AuthProvider>
  );
}
