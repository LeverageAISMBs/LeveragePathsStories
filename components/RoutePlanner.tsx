
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, Loader2, Footprints, Car, CloudRain, Sparkles, ScrollText, Sword, Mic2 } from 'lucide-react';
import { RouteDetails, AppState, StoryStyle } from '../types';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onRouteFound: (details: RouteDetails) => void;
  appState: AppState;
  externalError?: string | null;
}

type TravelMode = 'WALKING' | 'DRIVING';

const STYLES: { id: StoryStyle; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'NOIR', label: 'Noir Thriller', icon: CloudRain, desc: 'Gritty, mysterious, rain-slicked streets.' },
    { id: 'CHILDREN', label: 'Children\'s Story', icon: Sparkles, desc: 'Whimsical, magical, and full of wonder.' },
    { id: 'HISTORICAL', label: 'Historical Epic', icon: ScrollText, desc: 'Grand, dramatic, echoing the past.' },
    { id: 'FANTASY', label: 'Fantasy Adventure', icon: Sword, desc: 'An epic quest through a magical realm.' },
];

const VOICES = [
    { id: 'Kore', label: 'Kore', desc: 'Default balanced narration' },
    { id: 'en-US-Wavenet-A', label: 'Voice A', desc: 'Warm and resonant' },
    { id: 'en-US-Wavenet-B', label: 'Voice B', desc: 'Clear and analytical' },
    { id: 'en-US-Wavenet-C', label: 'Voice C', desc: 'Soft and expressive' },
];

const RoutePlanner: React.FC<Props> = ({ onRouteFound, appState, externalError }) => {
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [travelMode, setTravelMode] = useState<TravelMode>('WALKING');
  const [selectedStyle, setSelectedStyle] = useState<StoryStyle>('NOIR');
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const startContainerRef = useRef<HTMLDivElement>(null);
  const endContainerRef = useRef<HTMLDivElement>(null);
  
  // Store the actual instances to read current values if needed
  const startAutocompleteRef = useRef<any>(null);
  const endAutocompleteRef = useRef<any>(null);

  useEffect(() => {
    if (externalError) {
        setError(externalError);
    }
  }, [externalError]);

  // Initialize Modern Place Autocomplete Element
  useEffect(() => {
    let isMounted = true;
    let interval: any = null;

    const initAutocomplete = async () => {
        // We need the 'places' library which is loaded in App.tsx
        if (!window.google?.maps?.places?.PlaceAutocompleteElement) {
             return;
        }
        
        try {
             const setupAutocomplete = (
                 container: HTMLDivElement | null,
                 setAddress: (addr: string) => void,
                 placeholder: string
             ) => {
                 if (!container || container.children.length > 0) return null;

                 // Use the modern PlaceAutocompleteElement constructor
                 const autocomplete = new window.google.maps.places.PlaceAutocompleteElement();
                 
                 // Styling via CSS variables to match our theme
                 // We apply specific colors here to ensure variables are set if Shadow DOM uses them
                 autocomplete.style.width = '100%';
                 autocomplete.style.height = '100%';
                 autocomplete.style.border = 'none';
                 autocomplete.style.background = 'transparent';
                 autocomplete.setAttribute('placeholder', placeholder);
                 
                 // Event listener for the new selection event
                 autocomplete.addEventListener('gmp-placeselect', async (event: any) => {
                     const { place } = event;
                     if (!place) return;

                     try {
                         // Fetch required fields for the new Place object
                         await place.fetchFields({ fields: ['formattedAddress', 'location', 'displayName'] });
                         const address = place.formattedAddress || place.displayName;
                         if (isMounted) {
                             setAddress(address);
                         }
                     } catch (e) {
                         console.error("Error fetching place details:", e);
                     }
                 });

                 container.appendChild(autocomplete);
                 return autocomplete;
             };

             if (!startAutocompleteRef.current) {
                startAutocompleteRef.current = setupAutocomplete(startContainerRef.current, setStartAddress, "Starting Point");
             }
             if (!endAutocompleteRef.current) {
                endAutocompleteRef.current = setupAutocomplete(endContainerRef.current, setEndAddress, "Destination");
             }

        } catch (e) {
            console.error("Failed to initialize PlaceAutocompleteElement:", e);
            if (isMounted) setError("Location search failed to initialize. Please refresh.");
        }
    };

    // Check periodically if the script loaded
    interval = setInterval(() => {
        if (window.google?.maps?.places?.PlaceAutocompleteElement) {
            clearInterval(interval);
            initAutocomplete();
        }
    }, 500);

    return () => {
        isMounted = false;
        clearInterval(interval);
        // Cleanup elements to prevent "Cannot read properties of undefined (reading 'suggestions')" crash
        if (startContainerRef.current && startAutocompleteRef.current) {
            try { 
                if (startContainerRef.current.contains(startAutocompleteRef.current)) {
                    startContainerRef.current.removeChild(startAutocompleteRef.current);
                }
            } catch(e) {}
            startAutocompleteRef.current = null;
        }
        if (endContainerRef.current && endAutocompleteRef.current) {
            try { 
                if (endContainerRef.current.contains(endAutocompleteRef.current)) {
                    endContainerRef.current.removeChild(endAutocompleteRef.current);
                }
            } catch(e) {}
            endAutocompleteRef.current = null;
        }
    };
  }, []);

  const handleCalculate = () => {
    // If user typed but didn't select, or to catch the current text
    const finalStart = startAddress;
    const finalEnd = endAddress;

    if (!finalStart || !finalEnd) {
      setError("Please search for and select both a start and end location from the suggestions.");
      return;
    }

    if (!window.google?.maps) {
         setError("Google Maps API is not loaded yet. Please refresh.");
         return;
    }

    setError(null);
    setIsLoading(true);

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: finalStart,
        destination: finalEnd,
        travelMode: window.google.maps.TravelMode[travelMode],
      },
      (result: any, status: any) => {
        setIsLoading(false);
        if (status === window.google.maps.DirectionsStatus.OK) {
          const leg = result.routes[0].legs[0];

          if (leg.duration.value > 14400) {
            setError("Sorry, this journey is too long. Please select a route under 4 hours.");
            return;
          }

          onRouteFound({
            startAddress: leg.start_address,
            endAddress: leg.end_address,
            distance: leg.distance.text,
            duration: leg.duration.text,
            durationSeconds: leg.duration.value,
            travelMode: travelMode,
            voiceName: selectedVoice,
            storyStyle: selectedStyle
          });
        } else {
          console.error("Directions error:", status, result);
          if (status === 'ZERO_RESULTS') {
              const mode = travelMode.toLowerCase();
              setError(`Sorry, we could not calculate ${mode} directions from "${finalStart}" to "${finalEnd}"`);
          } else {
              setError("Could not calculate route. Please check the locations and try again.");
          }
        }
      }
    );
  };

  const isLocked = appState > AppState.ROUTE_CONFIRMED;

  return (
    <div className={`transition-all duration-700 ${isLocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
      <style>{`
        /* Correct tag name for Maps JS API V3 place autocomplete */
        gmp-place-autocomplete {
            --gmpx-color-surface: transparent;
            --gmpx-color-on-surface: #000000;
            --gmpx-color-on-surface-variant: #57534E; /* stone-600 */
        }

        gmp-place-autocomplete::part(input) {
          background: transparent;
          border: none;
          padding-left: 3rem;
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          font-size: 1rem;
          color: #000000 !important; /* Force black for contrast */
          height: 100%;
          opacity: 1;
        }

        gmp-place-autocomplete::part(input):focus {
            outline: none;
        }

        /* Ensure placeholder is visible but distinct */
        gmp-place-autocomplete::part(input)::placeholder {
            color: #78716c; /* stone-500 */
            opacity: 1;
        }
      `}</style>

      <div className="space-y-8 bg-white/80 backdrop-blur-lg p-8 md:p-10 rounded-[2rem] shadow-2xl shadow-stone-200/50 border border-white/50">
        <div className="space-y-1">
            <h2 className="text-2xl font-serif text-editorial-900">Plan Your Journey</h2>
            <p className="text-stone-500">Search locations using the latest Places search.</p>
        </div>

        <div className="space-y-4">
          <div className="relative group z-20 h-14 bg-stone-50/50 border-2 border-stone-100 focus-within:border-editorial-900 focus-within:bg-white rounded-xl transition-all shadow-sm focus-within:shadow-md">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-editorial-900 transition-colors pointer-events-none z-10" size={20} />
            <div ref={startContainerRef} className="w-full h-full" />
          </div>

          <div className="relative group z-10 h-14 bg-stone-50/50 border-2 border-stone-100 focus-within:border-editorial-900 focus-within:bg-white rounded-xl transition-all shadow-sm focus-within:shadow-md">
            <Navigation className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-editorial-900 transition-colors pointer-events-none z-10" size={20} />
            <div ref={endContainerRef} className="w-full h-full" />
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
                <label className="text-sm font-medium text-stone-500 uppercase tracking-wider">Travel Mode</label>
                <div className="flex gap-2 bg-stone-100/50 p-1.5 rounded-xl border border-stone-100">
                    {(['WALKING', 'DRIVING'] as TravelMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setTravelMode(mode)}
                            disabled={isLocked}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
                                travelMode === mode 
                                    ? 'bg-white text-editorial-900 shadow-md' 
                                    : 'text-stone-500 hover:bg-stone-200/50 hover:text-stone-700'
                            }`}
                        >
                            {mode === 'WALKING' && <Footprints size={18} />}
                            {mode === 'DRIVING' && <Car size={18} />}
                            <span className="hidden lg:inline">
                                {mode === 'WALKING' ? 'Walk' : 'Drive'}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Voice Selector */}
        <div className="space-y-3">
            <label className="text-sm font-medium text-stone-500 uppercase tracking-wider">Narration Voice</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {VOICES.map((voice) => {
                    const isSelected = selectedVoice === voice.id;
                    return (
                        <button
                            key={voice.id}
                            onClick={() => setSelectedVoice(voice.id)}
                            disabled={isLocked}
                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                                isSelected
                                    ? 'border-editorial-900 bg-editorial-900 text-white shadow-md'
                                    : 'border-stone-100 bg-stone-50/50 text-stone-600 hover:border-stone-300 hover:bg-stone-100'
                            }`}
                        >
                            <Mic2 size={20} className={`shrink-0 ${isSelected ? 'text-white' : 'text-stone-400'}`} />
                            <div className="text-xs font-bold truncate w-full">{voice.label}</div>
                        </button>
                    );
                })}
            </div>
        </div>

        {/* Story Style Selector */}
        <div className="space-y-3">
            <label className="text-sm font-medium text-stone-500 uppercase tracking-wider">Story Style</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STYLES.map((style) => {
                    const Icon = style.icon;
                    const isSelected = selectedStyle === style.id;
                    return (
                        <button
                            key={style.id}
                            onClick={() => setSelectedStyle(style.id)}
                            disabled={isLocked}
                            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                                isSelected
                                    ? 'border-editorial-900 bg-editorial-900 text-white shadow-md'
                                    : 'border-stone-100 bg-stone-50/50 text-stone-600 hover:border-stone-300 hover:bg-stone-100'
                            }`}
                        >
                            <Icon size={24} className={`shrink-0 ${isSelected ? 'text-white' : 'text-stone-400'}`} />
                            <div>
                                <div className={`font-bold ${isSelected ? 'text-white' : 'text-editorial-900'}`}>
                                    {style.label}
                                </div>
                                <div className={`text-xs mt-1 leading-tight ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                                    {style.desc}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg font-medium animate-fade-in">{error}</p>
        )}

        <button
          onClick={handleCalculate}
          disabled={isLoading || isLocked || !startAddress || !endAddress}
          className="w-full bg-editorial-900 text-white py-4 rounded-full font-bold text-lg hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-editorial-900/20 active:scale-[0.99]"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" /> Planning Journey...
            </>
          ) : (
            <>
               <Sparkles size={20} className="animate-subtle-pulse" />
               Generate your story
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RoutePlanner;
