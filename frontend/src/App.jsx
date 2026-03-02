import React, { useState } from 'react';
import UploadScreen from './screens/UploadScreen';
import MapOverview from './screens/MapOverview';
// import MatchExplorer from './screens/MatchExplorer'; // Step 7

/**
 * App — top-level screen router.
 *
 * Screen state machine:
 *   'upload'   → UploadScreen     (entry point)
 *   'overview' → MapOverview      (default after upload — Step 5)
 *   'explorer' → MatchExplorer    (drill-down — Step 7)
 *
 * uploadSummary carries the response from POST /upload across screens:
 *   { match_count, player_count, map_count, maps }
 */
export default function App() {
  const [screen, setScreen] = useState('upload');
  const [uploadSummary, setUploadSummary] = useState(null);

  // Called by UploadScreen when /upload succeeds
  function handleUploadComplete(summary) {
    setUploadSummary(summary);
    setScreen('overview');
  }

  // Called by MatchExplorer to go back to the map overview
  function handleBackToOverview() {
    setScreen('overview');
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  if (screen === 'upload') {
    return <UploadScreen onUploadComplete={handleUploadComplete} />;
  }

  if (screen === 'overview') {
    return (
      <MapOverview
        summary={uploadSummary}
        onExplore={() => setScreen('explorer')}
        onReupload={() => setScreen('upload')}
      />
    );
  }

  if (screen === 'explorer') {
    // MatchExplorer wired in Step 7
    return <ExplorerPlaceholder onBack={handleBackToOverview} />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Temporary placeholder — replaced in Step 7
// ---------------------------------------------------------------------------

function ExplorerPlaceholder({ onBack }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 text-white">
      <h2 className="text-2xl font-bold">Match Explorer</h2>
      <p className="text-zinc-400 text-sm">(This screen is built in Step 7)</p>
      <button
        onClick={onBack}
        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white"
      >
        ← Back to Map Overview
      </button>
    </div>
  );
}

