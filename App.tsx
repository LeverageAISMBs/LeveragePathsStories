
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



import React, { useState, useEffect, useRef } from 'react';
import { Headphones, Map as MapIcon, Sparkles, ArrowRight, Loader2, AlertTriangle, X } from 'lucide-react';
import RoutePlanner from './components/RoutePlanner';
import StoryPlayer from './components/StoryPlayer';
import MapBackground from './components/MapBackground';
import { AppState, RouteDetails, AudioStory } from './types';
import { generateSegment, generateSegmentAudio, calculateTotalSegments, generateStoryOutline } from './services/geminiService';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

// Helper to prevent infinite hangs on network requests
const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([
        promise.then(val => { clearTimeout(timer); return val; }),
        timeoutPromise
    ]);
};

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.PLANNING);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [story, setStory] = useState<AudioStory | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // --- Buffering Engine State ---
  const isGeneratingRef = useRef<boolean>(false);
  const [isBackgroundGenerating, setIsBackgroundGenerating] = useState(false);
  // Track which segment the user is currently listening to (fed back from StoryPlayer)
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(0);

  // --- Google Maps Bootstrap ---
  useEffect(() => {
    const SCRIPT_ID = 'google-maps-script';
    
    const getMapsApiKey = () => {
        // Prioritize specific maps key, fallback to generic
        const key = process.env.GOOGLE_MAPS_API_KEY || process.env.API_KEY;
        if (!key || key === 'undefined' || key === 'null') return null;
        return key.replace(/["']/g, "").trim();
    };

    const apiKey = getMapsApiKey();

    if (!apiKey) {
        setScriptError("API Key is missing. Maps functionality will be limited.");
        console.warn("Critical: API Key for Maps is missing or 'undefined'.");
        return;
    }
    
    if (document.getElementById(SCRIPT_ID) || window.google?.maps) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onerror = () => setScriptError("Google Maps failed to load.");
    // @ts-ignore
    window.gm_authFailure = () => {
        console.error("Google Maps Authentication Failed.");
        setScriptError("Google Maps authentication failed. Please check your API key.");
    };
    document.head.appendChild(script);
  }, []);

  // --- Continuous Buffering Engine ---
  useEffect(() => {
      if (!story || !route || appState < AppState.READY_TO_PLAY) return;

      const totalGenerated = story.segments.length;
      const neededBufferIndex = currentPlayingIndex + 3; 

      if (totalGenerated < neededBufferIndex && totalGenerated < story.totalSegmentsEstimate && !isGeneratingRef.current) {
          generateNextSegment(totalGenerated + 1);
      }
  }, [story, route, appState, currentPlayingIndex]);

  const generateNextSegment = async (index: number) => {
      if (!route || !story || isGeneratingRef.current) return;
      
      try {
          isGeneratingRef.current = true;
          setIsBackgroundGenerating(true);
          console.log(`[Buffering] Starting generation for Segment ${index}...`);

          const allPreviousText = story.segments.map(s => s.text).join(" ").slice(-3000);
          const segmentOutline = story.outline[index - 1] || "Continue the journey towards the final destination.";

          const segmentData = await withTimeout(
              generateSegment(route, index, story.totalSegmentsEstimate, segmentOutline, allPreviousText),
              60000,
              `Text generation timed out for segment ${index}`
          );
          
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const tempCtx = new AudioContextClass();
          const audioBuffer = await withTimeout(
              generateSegmentAudio(segmentData.text, tempCtx, route.voiceName),
              100000,
              `Audio generation timed out for segment ${index}`
          );
          await tempCtx.close();

          setStory(prev => {
              if (!prev) return null;
              if (prev.segments.some(s => s.index === index)) return prev;
              return {
                  ...prev,
                  segments: [...prev.segments, { ...segmentData, audioBuffer }].sort((a, b) => a.index - b.index)
              };
          });
          console.log(`[Buffering] Segment ${index} ready.`);

      } catch (e) {
          console.error(`Failed to generate segment ${index}`, e);
      } finally {
          isGeneratingRef.current = false;
          setIsBackgroundGenerating(false);
      }
  };

  const handleGenerateStory = async (details: RouteDetails) => {
    setRoute(details);
    setGenerationError(null);
    
    try {
      setAppState(AppState.GENERATING_INITIAL_SEGMENT);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const totalSegmentsEstimate = calculateTotalSegments(details.durationSeconds);
      setLoadingMessage("Crafting story arc...1 - 2 minutes");

      const outline = await withTimeout(
          generateStoryOutline(details, totalSegmentsEstimate),
          60000, "Story outline generation timed out"
      );

      setLoadingMessage("Writing first chapter... 1 minute");

      const firstOutlineBeat = outline[0] || "Begin the journey.";
      const seg1Data = await withTimeout(
          generateSegment(details, 1, totalSegmentsEstimate, firstOutlineBeat, ""),
          60000, "Initial text generation timed out"
      );
      
      setLoadingMessage("Preparing audio stream...30 seconds");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioContextClass();
      const seg1Audio = await withTimeout(
          generateSegmentAudio(seg1Data.text, tempCtx, details.voiceName),
          100000, "Initial audio generation timed out"
      );
      await tempCtx.close();

      setStory({
          totalSegmentsEstimate,
          outline,
          segments: [{ ...seg1Data, audioBuffer: seg1Audio }]
      });

      setAppState(AppState.READY_TO_PLAY);

    } catch (error: any) {
      console.error("Initial generation failed:", error);
      setAppState(AppState.PLANNING);
      
      let message = "Failed to start story stream. Please check your locations/connection and try again.";
      if (error.message && (error.message.includes("timed out") || error.message.includes("timeout"))) {
          message = "Story generation timed out. It might be that your journey is too long. Please try again.";
      }
      
      setGenerationError(message);
    }
  };

  const handleReset = () => {
      setAppState(AppState.PLANNING);
      setRoute(null);
      setStory(null);
      setCurrentPlayingIndex(0);
      setGenerationError(null);
      isGeneratingRef.current = false;
      setIsBackgroundGenerating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const isHeroVisible = appState < AppState.READY_TO_PLAY;

  return (
    <div className="min-h-screen bg-editorial-100 text-editorial-900 relative selection:bg-stone-200">
      <MapBackground route={route} />

      {/* Non-intrusive error display for script issues */}
      {scriptError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-white border-2 border-red-100 p-3 px-5 rounded-full shadow-lg flex items-center gap-3 animate-fade-in">
              <AlertTriangle size={18} className="text-red-500" />
              <span className="text-sm font-medium text-stone-600">{scriptError}</span>
              <button onClick={() => setScriptError(null)} className="text-stone-400 hover:text-stone-600 ml-2">
                  <X size={16} />
              </button>
          </div>
      )}

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-32">
        <div className={`transition-all duration-700 origin-top ease-in-out max-w-4xl mx-auto ${isHeroVisible ? 'opacity-100 translate-y-0 mb-16' : 'opacity-0 -translate-y-10 h-0 overflow-hidden mb-0'}`}>
            <h1 className="text-5xl md:text-7xl font-serif leading-[1.05] tracking-tight mb-8">
                Turn your journey into <br/> <span className="italic text-stone-500">a living story.</span>
            </h1>
            <p className="text-xl text-stone-600 max-w-xl leading-relaxed font-light">
                Enter your route, and we'll generate a continuous, adaptive audio narrative that moves with you.
            </p>
        </div>

        <div className={`max-w-4xl mx-auto transition-all duration-700 ${appState > AppState.GENERATING_INITIAL_SEGMENT ? 'hidden' : 'block'}`}>
            <RoutePlanner 
              onRouteFound={handleGenerateStory} 
              appState={appState} 
              externalError={generationError}
            />
        </div>

        {appState === AppState.GENERATING_INITIAL_SEGMENT && (
            <div className="mt-16 flex flex-col items-center justify-center space-y-8 animate-fade-in text-center py-12 max-w-4xl mx-auto">
                <Loader2 size={48} className="animate-spin text-editorial-900" />
                <h3 className="text-3xl font-serif text-editorial-900">{loadingMessage}</h3>
            </div>
        )}

        {appState >= AppState.READY_TO_PLAY && story && route && (
            <div className="mt-8 animate-fade-in">
                <StoryPlayer 
                    story={story} 
                    route={route} 
                    onSegmentChange={(index) => setCurrentPlayingIndex(index)}
                    isBackgroundGenerating={isBackgroundGenerating}
                />
                
                <div className="mt-24 text-center border-t border-stone-200 pt-12">
                    <button
                        onClick={handleReset}
                        className="group bg-white hover:bg-stone-50 text-editorial-900 px-8 py-4 rounded-full font-bold flex items-center gap-3 mx-auto transition-all border-2 border-stone-100 hover:border-stone-200 shadow-sm"
                    >
                        End Journey & Start New
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
