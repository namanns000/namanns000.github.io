# FLAC Web Player (MVP)

Local single-page FLAC player implemented with HTML, CSS and JS. It uses the browser's native audio decoding (where available) and the Web Audio API for visualization and EQ.

Features included:
- Load local audio files (drag & drop or file picker)
- Playlist management (in-memory)
- Play / Pause / Prev / Next
- Seek, volume, playback speed
- Visualizer (frequency bars)
- 6-band Equalizer
- Basic crossfade UI (simple implementation)
- Metadata extraction (using `music-metadata-browser`)
- Keyboard shortcuts: Space (play/pause), Left/Right (seek), Up/Down (volume)

Notes & limitations:
- Browser must support FLAC in `<audio>`; Chrome, Firefox and modern Edge support FLAC. Safari support may vary.
- This is an MVP; features like streaming, gapless guaranteed playback, advanced playlist persistence, network streaming, mobile-specific optimizations, and full VLC/Spotify parity are out of scope for a single-file example.

How to run:
1. Open `flacapp.html` in your browser (double-click or `open flacapp.html` on macOS).
2. Drag FLAC files onto the page or use the file picker.
PWA & persistence:
The app supports installability (manifest + service worker). You can install it from supported browsers' install prompt.
Playlists are persisted in the browser's IndexedDB (the File blobs are stored). Files added from the file picker are saved so the playlist can be restored across page reloads. Note: Some browsers may ask for permission or clear storage on data/privacy settings.

Want more? I can:
- Add persistent playlists (IndexedDB)
- Improve crossfade/gapless using two-buffer scheduling
- Add CUE / chapter support, streaming sources, or a server-backed library
- Build a React/Vue app with modular components
