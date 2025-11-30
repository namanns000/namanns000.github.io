# FLAC Web Player (Full-Featured)

Local single-page FLAC/audio player implemented with HTML, CSS and JS. Uses browser native audio decoding and Web Audio API for visualization, EQ, and gapless playback scheduling.

## Features

**Playback**
- Load local audio files (drag & drop or file picker)
- Play / Pause / Prev / Next with keyboard shortcuts (Space, Arrows)
- Seek slider with duration display
- Playback speed control (0.5x – 2.0x)
- Shuffle and repeat modes (off / one / all)
- Crossfade between tracks (0–10 seconds)
- **Gapless playback** using decoded AudioBuffers (when browser supports decoding)
- **Pause/Resume** with accurate offset tracking for buffer playback

**Audio Processing**
- **6-band Equalizer** (60Hz, 170Hz, 350Hz, 1kHz, 3.5kHz, 10kHz) with ±12dB range
- Live **frequency visualizer** (animated bar spectrum)
- Volume control
- Web Audio routing for sample-accurate mixing

**Playlists & Storage**
- **Current playlist** with track reordering (up/down buttons)
- **Save named playlists** to IndexedDB (persistent across reloads)
- **Load / Delete** saved playlists
- Export/Import playlists as JSON metadata
- Clear current playlist
- File blobs stored in IndexedDB for playlist recovery

**UI & Experience**
- **Dark / Light theme** toggle (persisted in localStorage)
- **Metadata extraction** from FLAC/MP3 tags (title, artist, album, artwork)
- **Album artwork** display
- Responsive design (desktop & mobile)
- Accessibility: ARIA labels, focus outlines, title attributes on all controls
- PWA support: installable on supported browsers (manifest + service worker)
- Stale-while-revalidate caching for offline capability

## Browser Support

- **Chrome/Chromium/Edge**: Full support (FLAC decoding, Web Audio API, IndexedDB, PWA)
- **Firefox**: Full support
- **Safari**: Limited (may not decode FLAC natively; fallback to media element playback)
- **Mobile**: iOS Safari has autoplay/audio constraints; Chrome Mobile recommended

## Quick Start

1. **Open the player**: Double-click `flacapp.html` or run `open flacapp.html` (macOS)
2. **Add files**: Drag FLAC files onto the page or use the file picker
3. **Play**: Click ▶ to start, use controls to navigate and adjust settings

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play / Pause |
| **←** | Seek back 5 seconds |
| **→** | Seek forward 5 seconds |
| **↑** | Volume +5% |
| **↓** | Volume -5% |

## Playlist Management

### Current Playlist
- Add files via picker or drag-drop
- Click track name to play
- Use ▲ / ▼ buttons to reorder tracks
- Click track to select it for playback

### Save Playlists
1. Add files to the current playlist
2. Enter a name in "Save as" field (e.g., "Favorites")
3. Click "Save" — playlist is stored in IndexedDB
4. Later, click "Load" to restore; "Delete" to remove

### Export/Import
- **Export**: Download current playlist as `.json` (includes track metadata)
- **Import**: Load a `.json` playlist file (metadata only; re-add files if needed)

## Features Detail

### Gapless Playback
When files are decoded successfully (browser support), the player schedules the next track to start exactly when the current one ends, eliminating silence or overlaps. Uses Web Audio API's AudioBufferSource scheduling with crossfade support for smooth transitions.

### Equalizer
6-band peaking EQ with independent ±12dB gain controls:
- 60 Hz (bass sub)
- 170 Hz (bass)
- 350 Hz (lower mid)
- 1 kHz (mid)
- 3.5 kHz (upper mid)
- 10 kHz (treble)

Adjustments apply to all sources in real time.

### Crossfade
Smooth linear crossfade between tracks using Web Audio GainNode ramping. Adjust duration (0–10 sec) to control blend; 0 disables crossfade.

### Theme Toggle
Click 🌓 in the header to switch between dark (Spotify-like) and light themes. Preference is saved to localStorage.

### Persistence
- **Playlists**: Stored in IndexedDB with file blobs; can be saved and restored
- **Theme**: Saved to localStorage
- **Service Worker**: Caches app shell for offline access (stale-while-revalidate)

## Known Limitations & Notes

1. **FLAC Decoding**: Depends on browser support. Older Safari and IE may not decode FLAC; fallback is media element playback (no gapless guarantee).
2. **Seeking in Buffer Mode**: Pausing mid-track and seeking resets playback chain; browser limitation of Web Audio API.
3. **Autoplay**: Requires user gesture (browser security). First play click serves this purpose.
4. **IndexedDB Storage**: Stored files count against browser quota; may prompt for permission or clear on privacy resets.
5. **Export/Import**: JSON exports contain metadata and file IDs but not audio data. Imports restore metadata only; files must be re-loaded.
6. **PWA**: Requires HTTPS in production (localhost OK for dev); install availability varies by browser.
7. **Mobile Audio Constraints**: iOS requires user gesture for playback and may limit background play.

## File Structure

```
/flacapp.html                    — Main HTML UI
/assets/
  ├── styles.css               — Dark/light theme CSS
  ├── player.js                — Core playback logic, IndexedDB, EQ, visualizer
  ├── icon-192.svg             — PWA icon (192×192)
  └── icon-512.svg             — PWA icon (512×512)
/manifest.json                  — PWA metadata
/service-worker.js              — Offline caching
/README_FLAC.md                 — This file
```

## Audio Processing Graph

```
┌─────────────────────────────┐
│ HTMLAudio / AudioBufferSource│
└──────────┬──────────────────┘
           │
    ┌──────▼─────────┐
    │ Gain (per-src) │
    └──────┬─────────┘
           │
┌──────────▼────────────────────┐
│ 6 × BiquadFilter (EQ chain)   │
│ [60Hz, 170Hz, 350Hz, 1kHz,    │
│  3.5kHz, 10kHz]               │
└──────────┬────────────────────┘
           │
      ┌────▼──────────┐
      │ AnalyserNode  │ ← Visualizer
      └────┬──────────┘
           │
   ┌───────▼──────────┐
   │ Master GainNode  │ ← Volume
   └───────┬──────────┘
           │
  ┌────────▼────────────┐
  │ AudioContext.dest   │
  │ (Speakers)          │
  └─────────────────────┘
```

## Console API (Debugging)

Accessible via browser console (`F12`):

```javascript
// Jump to track index
window._player.playIndex(2)

// Get current playlist
window._player.playlist

// Refresh playlist UI
window._player.renderPlaylistUI()

// Current audio element (fallback mode)
window._player.activeAudio
```

## Future Enhancements

- Network audio streaming (HTTP/HTTPS)
- Advanced tag editing
- Theme presets (warm, cool, vinyl, etc.)
- Cloud library integration (Subsonic, Nextcloud Music)
- Lyrics display
- Last.fm / MusicBrainz metadata lookup
- Mobile native app
- Waveform preview

## Performance Tips

1. **Decoder caching**: First load of a file decodes it. Subsequent plays use the cached AudioBuffer.
2. **Large playlists**: Loading many files at once may take time; metadata parsing is asynchronous.
3. **Visualizer FPS**: Frame rate depends on browser; disable visualizer or reduce canvas size on slow devices.

## Attribution & License

Built with vanilla JavaScript, Web Audio API, and `music-metadata-browser` for metadata extraction.

Use freely. Attribution appreciated. Share improvements!
