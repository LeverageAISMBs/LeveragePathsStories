
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useEffect, useRef } from 'react';
import { RouteDetails } from '../types';

interface Props {
  route: RouteDetails;
  currentSegmentIndex: number;
  totalSegments: number;
}

const InlineMap: React.FC<Props> = ({ route, currentSegmentIndex, totalSegments }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const progressMarkerRef = useRef<any>(null);
  const pulseCircleRef = useRef<any>(null);
  const routePathRef = useRef<any[]>([]); 
  const animationFrameRef = useRef<number>(0);

  // 1. Init Map
  useEffect(() => {
    if (!window.google || !mapRef.current) return;

    if (!googleMapRef.current) {
      googleMapRef.current = new window.google.maps.Map(mapRef.current, {
        zoom: 13,
        center: { lat: 0, lng: 0 },
        disableDefaultUI: true,
        zoomControl: true,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
            { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
            { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
            { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
            { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
            { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
            { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
            { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
            { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
            { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] },
            { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
            { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
            { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
            { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
            { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
        ]
      });

      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: googleMapRef.current,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: "#1A1A1A",
          strokeWeight: 6,
          strokeOpacity: 0.95
        }
      });
    }

    // Cleanup pulse animation
    return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // 2. Calculate Route & Save Path
  useEffect(() => {
    if (route && directionsRendererRef.current && googleMapRef.current) {
        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route(
          {
            origin: route.startAddress,
            destination: route.endAddress,
            travelMode: window.google.maps.TravelMode[route.travelMode],
          },
          (result: any, status: any) => {
            if (status === window.google.maps.DirectionsStatus.OK) {
              directionsRendererRef.current.setDirections(result);
              routePathRef.current = result.routes[0].overview_path;

              const bounds = result.routes[0].bounds;
              googleMapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });

              // Progress Marker
              if (!progressMarkerRef.current) {
                  progressMarkerRef.current = new window.google.maps.Marker({
                      map: googleMapRef.current,
                      position: routePathRef.current[0],
                      zIndex: 1000,
                      icon: {
                          path: window.google.maps.SymbolPath.CIRCLE,
                          scale: 9,
                          fillColor: "#1A1A1A",
                          fillOpacity: 1,
                          strokeColor: "#FFFFFF",
                          strokeWeight: 3,
                      },
                      optimized: false // Required for some animations
                  });
              }

              // Pulse Circle
              if (!pulseCircleRef.current) {
                  pulseCircleRef.current = new window.google.maps.Circle({
                      map: googleMapRef.current,
                      center: routePathRef.current[0],
                      radius: 0, // Managed by animation
                      fillColor: "#1A1A1A",
                      fillOpacity: 0.2,
                      strokeColor: "#1A1A1A",
                      strokeWeight: 1,
                      strokeOpacity: 0.3,
                      clickable: false,
                      zIndex: 999
                  });
                  startPulseAnimation();
              }
            }
          }
        );
      }
  }, [route]);

  // 3. Pulse Animation Loop
  const startPulseAnimation = () => {
      let start = Date.now();
      const animate = () => {
          if (!pulseCircleRef.current || !progressMarkerRef.current) return;
          
          const elapsed = Date.now() - start;
          const duration = 2000; // 2 seconds per pulse
          const t = (elapsed % duration) / duration;
          
          // Smooth pulse: expansion followed by fade
          // We estimate a visual radius based on t. 
          // Note: In meters, so this depends on zoom level for "visual" consistency.
          const radius = t * 150; 
          const opacity = 0.4 * (1 - t);
          
          pulseCircleRef.current.setRadius(radius);
          pulseCircleRef.current.setOptions({ 
              fillOpacity: opacity, 
              strokeOpacity: opacity * 1.5 
          });
          pulseCircleRef.current.setCenter(progressMarkerRef.current.getPosition());

          animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
  };

  // 4. Update Marker Position with Smooth Interpolation
  useEffect(() => {
      if (!progressMarkerRef.current || routePathRef.current.length === 0) return;

      const path = routePathRef.current;
      const safeIndex = Math.min(currentSegmentIndex, totalSegments);
      const progressRatio = safeIndex / Math.max(1, totalSegments);
      const pathIndex = Math.min(
          Math.floor(progressRatio * (path.length - 1)), 
          path.length - 1
      );

      const targetPos = path[pathIndex];
      const startPos = progressMarkerRef.current.getPosition();

      if (targetPos && startPos) {
          // Simple interpolation over 1.2 seconds when segment changes
          let startTime = Date.now();
          const duration = 1200; 
          
          const glide = () => {
              const now = Date.now();
              const elapsed = now - startTime;
              const p = Math.min(elapsed / duration, 1);
              
              // Easing function: easeInOutCubic
              const easedP = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

              const lat = startPos.lat() + (targetPos.lat() - startPos.lat()) * easedP;
              const lng = startPos.lng() + (targetPos.lng() - startPos.lng()) * easedP;
              
              const newPos = new window.google.maps.LatLng(lat, lng);
              progressMarkerRef.current.setPosition(newPos);
              if (pulseCircleRef.current) pulseCircleRef.current.setCenter(newPos);

              if (p < 1) {
                  requestAnimationFrame(glide);
              }
          };
          glide();
      }

  }, [currentSegmentIndex, totalSegments]);

  return <div ref={mapRef} className="w-full h-full bg-stone-100" />;
};

export default InlineMap;
