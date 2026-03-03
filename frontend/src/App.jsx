import React, { useState } from 'react';
import UploadScreen from './screens/UploadScreen';
import MapOverview from './screens/MapOverview';
import MatchExplorer from './screens/MatchExplorer';

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
    return (
      <MatchExplorer
        summary={uploadSummary}
        onBack={handleBackToOverview}
      />
    );
  }

  return null;
}

