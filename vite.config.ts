
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // helper to clean keys
    const cleanKey = (key: string | undefined) => {
      if (!key) return undefined;
      const k = key.trim();
      // Filter out common placeholders or invalid values
      if (k === '' || k === 'undefined' || k === 'GEMINI_API_KEY' || k === 'API_KEY' || k.includes('YOUR_API_KEY')) return undefined;
      return k;
    };

    // Try to find a valid key in various locations
    // We prioritize specific keys for specific services if available
    const mapsKey = cleanKey(process.env.GOOGLE_MAPS_API_KEY) || 
                    cleanKey(env.GOOGLE_MAPS_API_KEY);

    const genAIKey = cleanKey(process.env.API_KEY) || 
                     cleanKey(process.env.GEMINI_API_KEY) || 
                     cleanKey(env.API_KEY) || 
                     cleanKey(env.GEMINI_API_KEY);

    // If no specific maps key, fallback to the generic one (assuming user has one key for both for now)
    const finalMapsKey = mapsKey || genAIKey;

    if (!genAIKey) {
       console.warn("⚠️  WARNING: API_KEY is undefined. The app may not function correctly.");
    }

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Correctly inject the string values. 
        'process.env.API_KEY': genAIKey ? JSON.stringify(genAIKey) : 'undefined',
        'process.env.GOOGLE_MAPS_API_KEY': finalMapsKey ? JSON.stringify(finalMapsKey) : 'undefined',
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
