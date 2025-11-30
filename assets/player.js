// FLAC Web Player - MVP
// Features: local file load, playlist, play/pause, seek, volume, playbackRate,
// visualizer, 6-band EQ, basic crossfade, metadata via music-metadata-browser

(function(){
  const fileInput = document.getElementById('fileInput');
  const btnDropHint = document.getElementById('btnDropHint');
  const playBtn = document.getElementById('play');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const shuffleBtn = document.getElementById('shuffle');
  const repeatBtn = document.getElementById('repeat');
  const seek = document.getElementById('seek');
  const currentTime = document.getElementById('currentTime');
  const durationNode = document.getElementById('duration');
  const volume = document.getElementById('volume');
  const playbackRate = document.getElementById('playbackRate');
  const crossfade = document.getElementById('crossfade');
  const playlistNode = document.getElementById('playlist');
  const titleNode = document.getElementById('title');
  const artistNode = document.getElementById('artist');
  const albumNode = document.getElementById('album');
  const cover = document.getElementById('cover');
  const visualizer = document.getElementById('visualizer');
  const eqContainer = document.querySelector('.eq-sliders');
  // accessibility/titles
  playBtn.title = 'Play / Pause'; prevBtn.title = 'Previous track'; nextBtn.title = 'Next track'; shuffleBtn.title = 'Toggle shuffle'; repeatBtn.title = 'Toggle repeat mode';
  volume.title = 'Volume'; playbackRate.title = 'Playback speed'; crossfade.title = 'Crossfade seconds';
  document.getElementById('fileInput').title = 'Add local files'; document.getElementById('btnDropHint').title = 'Drag and drop files';

  const audioA = new Audio();
  const audioB = new Audio();
  let activeAudio = audioA;
  let standbyAudio = audioB;
  audioA.crossOrigin = "anonymous";
  audioB.crossOrigin = "anonymous";

  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
  const masterGain = ctx.createGain(); masterGain.gain.value = 1; masterGain.connect(ctx.destination);

  // EQ bands
  const eqFrequencies = [60,170,350,1000,3500,10000];
  const eqNodes = eqFrequencies.map(freq=>{const f=ctx.createBiquadFilter();f.type='peaking';f.frequency.value=freq;f.Q.value=1.0;f.gain.value=0;return f});

  // per-audio gain nodes for proper crossfade control
  const gainA = ctx.createGain(); gainA.gain.value = 1;
  const gainB = ctx.createGain(); gainB.gain.value = 0;

  // build shared chain: (src -> perGain) -> eq chain -> analyser -> masterGain
  function connectElementToContext(audioEl, perGain){
    try{
      const src = ctx.createMediaElementSource(audioEl);
      src.connect(perGain);
      // connect through eq chain
      let node = perGain;
      eqNodes.forEach(eq=>{ node.connect(eq); node = eq });
      node.connect(analyser);
      analyser.connect(masterGain);
      return src;
    }catch(e){ console.warn('AudioContext createMediaElementSource failed', e); }
  }
  connectElementToContext(audioA, gainA);
  connectElementToContext(audioB, gainB);

  // visualizer
  const canvas = visualizer; const cctx = canvas.getContext('2d');
  function resizeCanvas(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight }
  window.addEventListener('resize', resizeCanvas); resizeCanvas();
  requestAnimationFrame(draw);
  function draw(){
    requestAnimationFrame(draw);
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    // apply metadata to UI
    titleNode.textContent = entry.meta.title||entry.file.name;
    artistNode.textContent = entry.meta.artist||'';
    albumNode.textContent = entry.meta.album||'';
    if(entry.coverUrl) cover.src = entry.coverUrl; else cover.src = '';

    // prefer buffer-based playback (gapless) when decoded
    if(entry.buffer){
      playBufferIndex(i);
    }else{
      // fallback to media element playback (previous behavior)
      if(entry.fileId){
        getFile(entry.fileId).then(fileBlob=>{
          if(fileBlob){
            const u = URL.createObjectURL(fileBlob);
            standbyAudio.src = u; standbyAudio.dataset._url = u;
          } else standbyAudio.src = entry.url;
          swapToStandbyAndPlay();
        }).catch(()=>{ standbyAudio.src = entry.url; swapToStandbyAndPlay(); });
      } else { standbyAudio.src = entry.url; swapToStandbyAndPlay(); }
    }
    setActiveListItem(i);
    savePlaylistToDB();
      });
    }
    function putFile(blob){
      return new Promise(async (res,rej)=>{
        const db = dbp || await openDB();
        const tx = db.transaction('files','readwrite');
        const store = tx.objectStore('files');
        const req = store.add({file:blob.name?blob:blob});
        req.onsuccess = ()=> res(req.result);
        req.onerror = ()=> rej(req.error);
      });
    }
    function getFile(id){
      return new Promise(async (res,rej)=>{
        const db = dbp || await openDB();
        const tx = db.transaction('files','readonly');
        const store = tx.objectStore('files');
        const req = store.get(id);
        req.onsuccess = ()=> res(req.result && req.result.file);
        req.onerror = ()=> rej(req.error);
      });
  }

  // --- Buffer-based gapless/crossfade playback ---
  let currentSource = null, nextSource = null;
  let currentGain = null, nextGain = null;
  let playStartTime = 0; // ctx.currentTime when current source started
  let playOffset = 0; // seconds offset into current buffer when started
  let isBufferPaused = false;

  function createBufferSource(buffer){
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain(); g.gain.value = 1;
    // connect: src -> gain -> eq chain -> analyser
    src.connect(g);
    let node = g;
    eqNodes.forEach(eq=>{ node.connect(eq); node = eq });
    node.connect(analyser);
    return {src,g};
  }


  // playlist state
  const playlist = [];
  let currentIndex = -1;
  let shuffle = false;
  let repeatMode = 0; // 0=off,1=one,2=all

  function addFiles(files){
    for(const f of files){
      const url = URL.createObjectURL(f);
      const entry = {file:f,url,displayName:f.name,duration:0,meta:{}, fileId:null, buffer:null};
      playlist.push(entry); renderPlaylistUI();

      // store file blob in IndexedDB so playlist can persist across reloads
      putFile(f).then(id=>{ entry.fileId = id; savePlaylistToDB(); }).catch(()=>{});

      // decode audio into AudioBuffer for gapless playback (best-effort)
      (async ()=>{
        try{
          const ab = await f.arrayBuffer();
          const decoded = await ctx.decodeAudioData(ab);
          entry.buffer = decoded;
          entry.duration = decoded.duration;
          savePlaylistToDB();
        }catch(e){ /* decoding may fail in some browsers for certain formats */ }
      })();

      // read metadata asynchronously
      musicMetadata.parseBlob(f).then(md=>{
        const common = md.common || {};
        entry.meta = common;
        if(common.title) entry.displayName = `${common.title} — ${common.artist||''}`;
        if(common.picture && common.picture.length){
          const pic = common.picture[0];
          const blob = new Blob([pic.data],{type:pic.format});
          entry.coverUrl = URL.createObjectURL(blob);
        }
        // update UI title element
        savePlaylistToDB(); renderPlaylistUI();
      }).catch(()=>{});
    }
    if(currentIndex===-1) playIndex(0);
  }

  function setActiveListItem(i){
    [...playlistNode.children].forEach(li=>li.classList.remove('active'));
    const li = playlistNode.children[i]; if(li) li.classList.add('active');
  }

  function playIndex(i){
    if(i<0 || i>=playlist.length) return;
    currentIndex = i;
    const entry = playlist[i];
    // ensure standbyAudio uses object URL for stored blob (if persisted), otherwise use existing
    if(entry.fileId){
      getFile(entry.fileId).then(fileBlob=>{
        if(fileBlob){
          const u = URL.createObjectURL(fileBlob);
          standbyAudio.src = u;
          standbyAudio.dataset._url = u;
        } else { standbyAudio.src = entry.url }
        afterStandbyLoaded();
      }).catch(()=>{ standbyAudio.src = entry.url; afterStandbyLoaded(); });
    } else { standbyAudio.src = entry.url; afterStandbyLoaded(); }

    function afterStandbyLoaded(){
    // apply metadata to UI
    titleNode.textContent = entry.meta.title||entry.file.name;
    artistNode.textContent = entry.meta.artist||'';
    albumNode.textContent = entry.meta.album||'';
    if(entry.coverUrl) cover.src = entry.coverUrl; else cover.src = '';
    // if nothing playing, start immediately
    swapToStandbyAndPlay();
    setActiveListItem(i);
    savePlaylistToDB();
    }
  }

  function swapToStandbyAndPlay(){
    // perform crossfade using per-audio gains
    const cf = parseFloat(crossfade.value) || 0;
    const now = ctx.currentTime;
    standbyAudio.playbackRate = parseFloat(playbackRate.value);
    standbyAudio.volume = parseFloat(volume.value);
    // ensure standby gain starts at 0
    const standbyGainNode = (standbyAudio===audioA)?gainA:gainB;
    const activeGainNode = (activeAudio===audioA)?gainA:gainB;
    try{
      standbyGainNode.gain.cancelScheduledValues(now);
      activeGainNode.gain.cancelScheduledValues(now);
      standbyGainNode.gain.setValueAtTime(0, now);
      standbyGainNode.gain.linearRampToValueAtTime(1, now + cf);
      activeGainNode.gain.setValueAtTime(activeGainNode.gain.value || 1, now);
      activeGainNode.gain.linearRampToValueAtTime(0, now + cf);
    }catch(e){/* ignore scheduling errors */}
    standbyAudio.play().then(()=>{
      setTimeout(()=>{
        try{ activeAudio.pause(); }catch(e){}
        const tmp = activeAudio; activeAudio = standbyAudio; standbyAudio = tmp;
        // swap gains so future fades are correct
        updateDurationUI(); updatePlayButton();
      }, (cf+0.05)*1000);
    }).catch(e=>console.warn('playback failed',e));
  }

  // play using decoded AudioBuffers for gapless / sample-accurate scheduling
  function playBufferIndex(i){
    const entry = playlist[i];
    if(!entry || !entry.buffer) return;
    // stop and cleanup previous sources
    try{ if(currentSource && currentSource.src) currentSource.src.stop(); }catch(e){}
    try{ if(nextSource && nextSource.src) nextSource.src.stop(); }catch(e){}
    currentSource = null; nextSource = null; currentGain = null; nextGain = null; isBufferPaused = false;

    const now = ctx.currentTime;
    // create current source and gain
    const cur = createBufferSource(entry.buffer);
    currentSource = cur.src; currentGain = cur.g;
    playStartTime = now; playOffset = 0;
    currentSource.start(now, playOffset);

    // schedule next if available and decoded
    const cf = parseFloat(crossfade.value) || 0;
    const nextIndex = (shuffle ? Math.floor(Math.random()*playlist.length) : i+1);
    if(nextIndex < playlist.length && playlist[nextIndex] && playlist[nextIndex].buffer){
      const nextBuf = playlist[nextIndex].buffer;
      const nxt = createBufferSource(nextBuf);
      nextSource = nxt.src; nextGain = nxt.g;
      const startAt = now + (entry.buffer.duration - cf);
      // initial gains
      currentGain.gain.setValueAtTime(1, now);
      nextGain.gain.setValueAtTime(0, now);
      // linear crossfade
      currentGain.gain.linearRampToValueAtTime(0, startAt + cf);
      nextGain.gain.linearRampToValueAtTime(1, startAt + cf);
      nextSource.start(startAt, 0);
      nextSource.onended = ()=>{ currentIndex = nextIndex; playIndex(currentIndex); };
    } else {
      currentSource.onended = ()=>{ if(repeatMode===1){ playBufferIndex(i); } else { if(repeatMode===2 && i+1>=playlist.length) playBufferIndex(0); else if(i+1<playlist.length) playBufferIndex(i+1); }};
    }

    updatePlayButton();
  }

  function updateDurationUI(){
    // update for media element or buffer playback
    let d = activeAudio.duration || 0;
    if(currentSource && playlist[currentIndex] && playlist[currentIndex].buffer) d = playlist[currentIndex].buffer.duration;
    durationNode.textContent = formatTime(d);
    seek.max = isFinite(d) && d>0 ? Math.floor(d) : 100;
  }

  function formatTime(t){ if(!isFinite(t)) return '0:00'; const m=Math.floor(t/60); const s=Math.floor(t%60).toString().padStart(2,'0'); return `${m}:${s}` }

  function updatePlayButton(){ playBtn.textContent = activeAudio.paused ? '▶' : '⏸' }

  // events
  playBtn.addEventListener('click',()=>{
    // handle buffer playback pause/resume
    if(currentSource){
      // buffer playback active
      if(!isBufferPaused){
        // pause: compute offset and stop
        const elapsed = ctx.currentTime - playStartTime;
        playOffset = playOffset + elapsed;
        try{ currentSource.stop(); }catch(e){}
        try{ if(nextSource) nextSource.stop(); }catch(e){}
        isBufferPaused = true; updatePlayButton();
      } else {
        // resume from offset by re-scheduling buffers
        resumeBufferPlayback();
      }
    } else {
      // fallback to media element playback
      if(activeAudio.paused) { ctx.resume(); activeAudio.play(); } else activeAudio.pause();
      updatePlayButton();
    }
  });
  prevBtn.addEventListener('click',()=>{
    let idx = currentIndex-1; if(idx<0) idx = playlist.length-1; playIndex(idx);
  });
  nextBtn.addEventListener('click',()=>{
    if(shuffle) { playIndex(Math.floor(Math.random()*playlist.length)); return }
    let idx = currentIndex+1; if(idx>=playlist.length) { if(repeatMode===2) idx=0; else return } playIndex(idx);
  });
  shuffleBtn.addEventListener('click',()=>{shuffle=!shuffle; shuffleBtn.style.opacity = shuffle?1:0.6});
  repeatBtn.addEventListener('click',()=>{ repeatMode=(repeatMode+1)%3; repeatBtn.textContent = repeatMode===1?'🔂':'🔁'; repeatBtn.style.opacity = repeatMode?1:0.6 });

  // monitor active audio to update UI and schedule gapless/crossfade
  let scheduledNext = false;
  function onTimeUpdate(){
    seek.value = Math.floor(activeAudio.currentTime);
    currentTime.textContent = formatTime(activeAudio.currentTime);
    const remaining = (activeAudio.duration || 0) - activeAudio.currentTime;
    const cf = parseFloat(crossfade.value) || 0;
    // schedule next when within crossfade window
    if(!scheduledNext && remaining <= cf + 0.2){
      scheduledNext = true;
      // prepare next track into standby
      const nextIndex = (shuffle ? Math.floor(Math.random()*playlist.length) : currentIndex+1);
      if(nextIndex < playlist.length){
        const nextEntry = playlist[nextIndex];
        if(nextEntry){
          if(nextEntry.fileId){
            getFile(nextEntry.fileId).then(blob=>{ if(blob){ standbyAudio.src = URL.createObjectURL(blob); } else standbyAudio.src = nextEntry.url; });
          } else standbyAudio.src = nextEntry.url;
        }
      }
    }
  }
  activeAudio.addEventListener('timeupdate', onTimeUpdate);

  // seek handler for buffer playback and media element fallback
  seek.addEventListener('input', ()=>{
    const val = Number(seek.value);
    if(currentSource){
      // stop sources and start buffer playback at offset
      playOffset = val;
      try{ if(currentSource) currentSource.stop(); }catch(e){}
      try{ if(nextSource) nextSource.stop(); }catch(e){}
      isBufferPaused = false;
      playBufferIndex(currentIndex);
    } else {
      activeAudio.currentTime = val;
    }
  });
  activeAudio.addEventListener('ended',()=>{
    scheduledNext = false;
    if(repeatMode===1) { activeAudio.currentTime=0; activeAudio.play(); }
    else nextBtn.click();
  });

  seek.addEventListener('input',()=>{ activeAudio.currentTime = seek.value });
  volume.addEventListener('input',()=>{ activeAudio.volume = volume.value; masterGain.gain.value = volume.value });
  playbackRate.addEventListener('input',()=>{ activeAudio.playbackRate = playbackRate.value });

  fileInput.addEventListener('change',(e)=> addFiles(e.target.files));

  // drag & drop
  ['dragenter','dragover'].forEach(ev=>{ document.addEventListener(ev,e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; },false) });
  document.addEventListener('drop',e=>{ e.preventDefault(); if(e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); },false);

  // keyboard shortcuts
  window.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT') return;
    if(e.code==='Space'){ e.preventDefault(); playBtn.click() }
    if(e.code==='ArrowRight'){ activeAudio.currentTime+=5 }
    if(e.code==='ArrowLeft'){ activeAudio.currentTime-=5 }
    if(e.code==='ArrowUp'){ activeAudio.volume = Math.min(1, activeAudio.volume+0.05); volume.value = activeAudio.volume }
    if(e.code==='ArrowDown'){ activeAudio.volume = Math.max(0, activeAudio.volume-0.05); volume.value = activeAudio.volume }
  });

  // Playlist export/import/clear UI
  const exportBtn = document.getElementById('exportPlaylist');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const clearBtn = document.getElementById('clearPlaylist');
  const savePlaylistBtn = document.getElementById('savePlaylist');
  const savePlaylistName = document.getElementById('savePlaylistName');
  const savedPlaylistsUl = document.getElementById('savedPlaylists');

  exportBtn.addEventListener('click', ()=>{
    const data = playlist.map(p=>({displayName:p.displayName, fileName:p.file?.name, fileId:p.fileId}));
    const blob = new Blob([JSON.stringify(data, null, 2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'playlist.json'; a.click(); URL.revokeObjectURL(url);
  });
  importBtn.addEventListener('click', ()=> importInput.click());
  importInput.addEventListener('change', e=>{
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const reader = new FileReader(); reader.onload = ()=>{
      try{
        const arr = JSON.parse(reader.result);
        // imported metadata cannot rehydrate blobs; prompt user to re-add files
        arr.forEach(it=>{ const li = document.createElement('li'); li.textContent = it.displayName || it.fileName || 'Unknown'; playlistNode.appendChild(li); });
        alert('Imported playlist metadata. To play files, add the actual files via the file picker.');
      }catch(e){ alert('Invalid playlist file'); }
    }; reader.readAsText(f);
  });
  clearBtn.addEventListener('click', ()=>{
    playlist.length = 0; playlistNode.innerHTML = ''; currentIndex = -1; savePlaylistToDB();
  });
  savePlaylistBtn.addEventListener('click', ()=>{
    const name = (savePlaylistName.value || '').trim(); if(!name) return alert('Enter a playlist name');
    saveNamedPlaylist(name);
  });

  // initialize saved playlists UI
  (async ()=>{ await openDB(); loadSavedPlaylistsUI(); })();

  // EQ UI
  eqFrequencies.forEach((freq,i)=>{
    const wrapper = document.createElement('div'); wrapper.style.flex='1'; wrapper.style.textAlign='center';
    const input = document.createElement('input'); input.type='range'; input.min='-12'; input.max='12'; input.step='0.5'; input.value='0';
    input.addEventListener('input',()=>{ eqNodes[i].gain.value = input.value });
    wrapper.appendChild(input); const label=document.createElement('div'); label.textContent=freq+' Hz'; label.style.fontSize='11px'; wrapper.appendChild(label);
    eqContainer.appendChild(wrapper);
  });

  // small helpers
  function formatTimeShort(t){return formatTime(t)}

  const themeToggle = document.getElementById('themeToggle');
  // load saved theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if(savedTheme === 'light') document.documentElement.classList.add('light');
  themeToggle.addEventListener('click', ()=>{
    const isLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });

  // load persisted playlist on startup
  (async function init(){
    try{ await openDB();
      const db = dbp;
      const tx = db.transaction('meta','readonly');
      const store = tx.objectStore('meta');
      const req = store.get('playlist-order');
      req.onsuccess = async ()=>{
        const order = req.result;
        if(order && order.length){
          // load files by id
          for(const item of order){
            if(item.fileId){
              const f = await getFile(item.fileId);
              if(f){ addFiles([f]); }
            }
          }
        }
      };
    }catch(e){}
  })();

  function savePlaylistToDB(){
    if(!dbp) return;
    const db = dbp; const tx = db.transaction('meta','readwrite'); const store = tx.objectStore('meta');
    const order = playlist.map(p=>({fileId:p.fileId,displayName:p.displayName}));
    try{ store.put(order, 'playlist-order'); }catch(e){}
  }

  // --- Named playlists management ---
  async function saveNamedPlaylist(name){
    if(!dbp) await openDB();
    const db = dbp; const tx = db.transaction('meta','readwrite'); const store = tx.objectStore('meta');
    const payload = playlist.map(p=>({fileId:p.fileId,displayName:p.displayName}));
    store.put(payload, `playlist:${name}`);
    loadSavedPlaylistsUI();
  }
  async function loadNamedPlaylist(name){
    if(!dbp) await openDB();
    const db = dbp; const tx = db.transaction('meta','readonly'); const store = tx.objectStore('meta');
    const req = store.get(`playlist:${name}`);
    req.onsuccess = async ()=>{
      const arr = req.result;
      if(!arr) return;
      // clear current playlist
      playlist.length = 0; playlistNode.innerHTML = '';
      // rehydrate by fileId where possible
      for(const it of arr){
        if(it.fileId){ const f = await getFile(it.fileId); if(f) addFiles([f]); }
      }
    };
  }
  async function deleteNamedPlaylist(name){
    if(!dbp) await openDB();
    const db = dbp; const tx = db.transaction('meta','readwrite'); const store = tx.objectStore('meta');
    store.delete(`playlist:${name}`);
    loadSavedPlaylistsUI();
  }
  function loadSavedPlaylistsUI(){
    if(!dbp) return; const db = dbp; const tx = db.transaction('meta','readonly'); const store = tx.objectStore('meta');
    const req = store.getAllKeys();
    req.onsuccess = ()=>{
      const keys = req.result.filter(k=> typeof k === 'string' && k.startsWith('playlist:'));
      const ul = document.getElementById('savedPlaylists'); ul.innerHTML = '';
      keys.forEach(k=>{
        const name = k.replace('playlist:','');
        const li = document.createElement('li');
        const span = document.createElement('span'); span.textContent = name; li.appendChild(span);
        const loadBtn = document.createElement('button'); loadBtn.textContent = 'Load'; loadBtn.addEventListener('click',()=>loadNamedPlaylist(name)); li.appendChild(loadBtn);
        const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.addEventListener('click',()=>deleteNamedPlaylist(name)); li.appendChild(delBtn);
        ul.appendChild(li);
      });
    };
  }

  function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c])); }
  function moveItemUp(idx){ if(idx<=0) return; const it = playlist.splice(idx,1)[0]; playlist.splice(idx-1,0,it); renderPlaylistUI(); savePlaylistToDB(); }
  function moveItemDown(idx){ if(idx<0 || idx>=playlist.length-1) return; const it = playlist.splice(idx,1)[0]; playlist.splice(idx+1,0,it); renderPlaylistUI(); savePlaylistToDB(); }
  function renderPlaylistUI(){ playlistNode.innerHTML = ''; playlist.forEach((entry,i)=>{ const li = document.createElement('li'); li.innerHTML = `<span class=\"pl-title\">${escapeHtml(entry.displayName)}</span><span class=\"pl-actions\"><button class=\"pl-up\" title=\"Move up\">▲</button><button class=\"pl-down\" title=\"Move down\">▼</button></span>`; li.dataset.index = i; li.querySelector('.pl-title').addEventListener('click',()=>playIndex(i)); li.querySelector('.pl-up').addEventListener('click',(e)=>{e.stopPropagation(); moveItemUp(i)}); li.querySelector('.pl-down').addEventListener('click',(e)=>{e.stopPropagation(); moveItemDown(i)}); playlistNode.appendChild(li); }); }
  // expose small API for debugging in console
  window._player = {playlist,playIndex,activeAudio,renderPlaylistUI};

  // resume buffer playback after pause
  function resumeBufferPlayback(){
    if(!playlist[currentIndex] || !playlist[currentIndex].buffer) return;
    const buf = playlist[currentIndex].buffer;
    // stop any existing
    try{ if(currentSource) currentSource.stop(); }catch(e){}
    try{ if(nextSource) nextSource.stop(); }catch(e){}
    currentSource = null; nextSource = null; currentGain = null; nextGain = null;
    const now = ctx.currentTime;
    const cur = createBufferSource(buf);
    currentSource = cur.src; currentGain = cur.g;
    playStartTime = now; // new start time
    currentSource.start(now, playOffset);
    // schedule next similarly as playBufferIndex
    const cf = parseFloat(crossfade.value) || 0;
    const nextIndex = (shuffle ? Math.floor(Math.random()*playlist.length) : currentIndex+1);
    if(nextIndex < playlist.length && playlist[nextIndex] && playlist[nextIndex].buffer){
      const nextBuf = playlist[nextIndex].buffer; const nxt = createBufferSource(nextBuf);
      nextSource = nxt.src; nextGain = nxt.g;
      const remaining = buf.duration - playOffset;
      const startAt = now + Math.max(0, remaining - cf);
      currentGain.gain.setValueAtTime(1, now);
      nextGain.gain.setValueAtTime(0, now);
      currentGain.gain.linearRampToValueAtTime(0, startAt + cf);
      nextGain.gain.linearRampToValueAtTime(1, startAt + cf);
      nextSource.start(startAt, 0);
      nextSource.onended = ()=>{ currentIndex = nextIndex; playIndex(currentIndex); };
    } else {
      currentSource.onended = ()=>{ if(repeatMode===1){ resumeBufferPlayback(); } else { if(repeatMode===2 && currentIndex+1>=playlist.length) playBufferIndex(0); else if(currentIndex+1<playlist.length) playBufferIndex(currentIndex+1); }};
    }
    isBufferPaused = false; updatePlayButton();
  }

})();
