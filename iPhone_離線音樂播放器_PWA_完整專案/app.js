(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const DB_NAME = "offline-music-library-v1";
  const STORE = "tracks";
  const bands = [
    {label:"31 Hz",freq:31,type:"lowshelf"},
    {label:"62 Hz",freq:62,type:"peaking"},
    {label:"125 Hz",freq:125,type:"peaking"},
    {label:"250 Hz",freq:250,type:"peaking"},
    {label:"500 Hz",freq:500,type:"peaking"},
    {label:"1 kHz",freq:1000,type:"peaking"},
    {label:"2 kHz",freq:2000,type:"peaking"},
    {label:"4 kHz",freq:4000,type:"peaking"},
    {label:"8 kHz",freq:8000,type:"peaking"},
    {label:"16 kHz",freq:16000,type:"highshelf"}
  ];
  let tracks = [];
  let currentId = null;
  let objectUrl = null;
  let audioContext = null;
  let sourceNode = null;
  let filters = [];
  let repeat = false;
  let shuffle = false;
  let isSeeking = false;
  let toastTimer;

  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {keyPath:"id"});
          store.createIndex("addedAt", "addedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbAction(mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = action(store);
      tx.oncomplete = () => { db.close(); resolve(result && result.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
  async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => { const result = req.result; db.close(); resolve(result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }
  async function persistTrack(track) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(track);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function deleteTrack(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  function titleFromFile(name) { return name.replace(/\.[^.]+$/, ""); }
  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    return `${String(Math.floor(sec / 60)).padStart(2,"0")}:${String(Math.floor(sec % 60)).padStart(2,"0")}`;
  }
  function activeTrack() { return tracks.find(t => t.id === currentId) || null; }

  function renderPlaylist() {
    const list = $("playlist");
    list.replaceChildren();
    $("trackCount").textContent = `${tracks.length} 首歌曲`;
    $("emptyState").style.display = tracks.length ? "none" : "block";
    tracks.forEach((track, index) => {
      const li = document.createElement("li");
      li.className = `track-row${track.id === currentId ? " active" : ""}`;
      const number = document.createElement("span");
      number.className = "track-number";
      number.textContent = track.id === currentId && !audio.paused ? "♫" : String(index + 1);
      const play = document.createElement("button");
      play.className = "track-play";
      play.type = "button";
      const name = document.createElement("span");
      name.className = "track-name";
      name.textContent = track.title;
      const type = document.createElement("span");
      type.className = "track-type";
      type.textContent = `${(track.type || "audio").toUpperCase()} · 本機儲存`;
      play.append(name, type);
      play.addEventListener("click", () => playTrack(track.id));
      const remove = document.createElement("button");
      remove.className = "remove-track";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `移除 ${track.title}`);
      remove.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (track.id === currentId) stopCurrent();
        tracks = tracks.filter(t => t.id !== track.id);
        try { await deleteTrack(track.id); } catch {}
        renderPlaylist();
      });
      li.append(number, play, remove);
      list.append(li);
    });
  }
  function renderNowPlaying() {
    const track = activeTrack();
    $("nowTitle").textContent = track ? track.title : "尚未選擇歌曲";
    $("nowDetail").textContent = track ? `${track.name} · 已匯入本機` : "點選「加入音樂」匯入手機或電腦裡的音樂";
    $("playBtn").textContent = audio.paused ? "▶" : "Ⅱ";
    $("playBtn").setAttribute("aria-label", audio.paused ? "播放" : "暫停");
    renderPlaylist();
  }
  function stopCurrent() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    currentId = null;
    $("seek").value = 0;
    $("currentTime").textContent = "00:00";
    $("duration").textContent = "00:00";
    renderNowPlaying();
  }
  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(file.name)) {
        continue;
      }
      const duplicate = tracks.some(t => t.name === file.name && t.size === file.size);
      if (duplicate) continue;
      const track = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name: file.name,
        title: titleFromFile(file.name),
        type: (file.name.split(".").pop() || "audio").toLowerCase(),
        size: file.size,
        blob: file,
        addedAt: Date.now()
      };
      try {
        await persistTrack(track);
        tracks.push(track);
        added++;
      } catch (err) {
        showToast("儲存失敗：儲存空間可能不足，請分批匯入較小的音樂檔。");
        break;
      }
    }
    tracks.sort((a,b) => a.addedAt - b.addedAt);
    renderPlaylist();
    if (added) showToast(`已匯入 ${added} 首歌曲，可離線播放`);
    else showToast("沒有新增歌曲；可能已匯入過或格式不支援");
    $("fileInput").value = "";
    if (!currentId && tracks.length) playTrack(tracks[0].id, false);
  }

  async function ensureAudioGraph() {
    if (!audioContext) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("此瀏覽器不支援 Web Audio EQ");
      audioContext = new AC();
      sourceNode = audioContext.createMediaElementSource(audio);
      let previous = sourceNode;
      filters = bands.map((band) => {
        const node = audioContext.createBiquadFilter();
        node.type = band.type;
        node.frequency.value = Math.min(band.freq, audioContext.sampleRate / 2 - 1);
        node.Q.value = 1;
        node.gain.value = 0;
        previous.connect(node);
        previous = node;
        return node;
      });
      const gain = audioContext.createGain();
      gain.gain.value = Number($("volume").value) / 100;
      previous.connect(gain);
      gain.connect(audioContext.destination);
      audio.volume = 1;
      applyEQ();
    }
    if (audioContext.state === "suspended") await audioContext.resume();
  }
  function applyEQ() {
    filters.forEach((filter, i) => {
      filter.gain.value = $("eqEnabled").checked ? Number($(`eq${i}`).value) : 0;
    });
    $("eqStatus").textContent = $("eqEnabled").checked ? "EQ 已啟用" : "EQ 已停用";
  }
  async function playTrack(id, autoplay = true) {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    try {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(track.blob);
      currentId = id;
      audio.src = objectUrl;
      audio.load();
      await ensureAudioGraph();
      if (autoplay) await audio.play();
      renderNowPlaying();
    } catch (err) {
      showToast(`無法播放此檔案：${err.message || "格式可能不支援"}`);
      renderNowPlaying();
    }
  }
  function goNext() {
    if (!tracks.length) return;
    let index = tracks.findIndex(t => t.id === currentId);
    if (shuffle && tracks.length > 1) {
      let next = index;
      while (next === index) next = Math.floor(Math.random() * tracks.length);
      playTrack(tracks[next].id);
    } else {
      playTrack(tracks[(index + 1 + tracks.length) % tracks.length].id);
    }
  }
  function goPrevious() {
    if (!tracks.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const index = tracks.findIndex(t => t.id === currentId);
    playTrack(tracks[(index - 1 + tracks.length) % tracks.length].id);
  }
  function buildEQ() {
    const container = $("eqControls");
    bands.forEach((band, i) => {
      const row = document.createElement("div");
      row.className = "eq-row";
      const label = document.createElement("label");
      label.htmlFor = `eq${i}`;
      label.textContent = band.label;
      const input = document.createElement("input");
      input.type = "range"; input.min = "-12"; input.max = "12"; input.step = "1";
      input.value = "0"; input.id = `eq${i}`;
      input.setAttribute("aria-label", `${band.label} EQ`);
      const output = document.createElement("output");
      output.id = `eqOut${i}`; output.textContent = "0 dB";
      input.addEventListener("input", () => {
        output.textContent = `${Number(input.value) > 0 ? "+" : ""}${input.value} dB`;
        applyEQ();
      });
      row.append(label, input, output);
      container.append(row);
    });
  }

  $("fileInput").addEventListener("change", e => importFiles(e.target.files));
  $("playBtn").addEventListener("click", async () => {
    if (!tracks.length) { $("fileInput").click(); return; }
    if (audio.paused) {
      if (!currentId) await playTrack(tracks[0].id);
      else {
        try { await ensureAudioGraph(); await audio.play(); }
        catch (e) { showToast(`播放失敗：${e.message}`); }
      }
    } else audio.pause();
    renderNowPlaying();
  });
  $("prevBtn").addEventListener("click", goPrevious);
  $("nextBtn").addEventListener("click", goNext);
  $("shuffleBtn").addEventListener("click", () => {
    shuffle = !shuffle;
    $("shuffleBtn").style.color = shuffle ? "#1685ff" : "";
    showToast(shuffle ? "隨機播放已開啟" : "隨機播放已關閉");
  });
  $("repeatBtn").addEventListener("click", () => {
    repeat = !repeat;
    audio.loop = repeat;
    $("repeatBtn").style.color = repeat ? "#1685ff" : "";
    showToast(repeat ? "單曲循環已開啟" : "循環已關閉");
  });
  $("volume").addEventListener("input", async e => {
    const v = Number(e.target.value) / 100;
    $("volumeLabel").textContent = `${e.target.value}%`;
    if (audioContext) {
      const gain = audioContext.destination; // gain node is controlled below
      if (filters.length) {
        const last = filters[filters.length - 1];
        const gainNode = last.context;
        // Store volume in audio element fallback and update the explicit master gain.
        if (window.masterGain) window.masterGain.gain.value = v;
      }
    } else audio.volume = v;
    try { if (audioContext && audioContext.state === "suspended") await audioContext.resume(); } catch {}
  });
  $("eqEnabled").addEventListener("change", async () => {
    try { await ensureAudioGraph(); } catch {}
    applyEQ();
  });
  $("flatBtn").addEventListener("click", () => {
    bands.forEach((_, i) => {
      $(`eq${i}`).value = 0;
      $(`eqOut${i}`).textContent = "0 dB";
    });
    applyEQ();
    showToast("EQ 已重設");
  });
  $("clearBtn").addEventListener("click", async () => {
    if (!tracks.length) return;
    if (!confirm("確定要清除所有已匯入的歌曲？這會刪除本機儲存的音樂副本。")) return;
    stopCurrent();
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    tracks = [];
    renderPlaylist();
    showToast("播放清單已清除");
  });
  $("seek").addEventListener("input", () => { isSeeking = true; });
  $("seek").addEventListener("change", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Number($("seek").value) / 1000 * audio.duration;
    }
    isSeeking = false;
  });
  audio.addEventListener("timeupdate", () => {
    if (!isSeeking && Number.isFinite(audio.duration) && audio.duration > 0) {
      $("seek").value = Math.round(audio.currentTime / audio.duration * 1000);
    }
    $("currentTime").textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener("loadedmetadata", () => {
    $("duration").textContent = formatTime(audio.duration);
    $("seek").value = 0;
  });
  audio.addEventListener("play", renderNowPlaying);
  audio.addEventListener("pause", renderNowPlaying);
  audio.addEventListener("ended", () => { if (!repeat) goNext(); });
  audio.addEventListener("error", () => {
    if (audio.src) showToast("瀏覽器無法解碼此格式，請試試 MP3、AAC/M4A 或 WAV。");
  });

  // Fix volume using a dedicated master GainNode at the end of the EQ chain.
  const originalEnsure = ensureAudioGraph;
  ensureAudioGraph = async function() {
    if (!audioContext) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("此瀏覽器不支援 Web Audio EQ");
      audioContext = new AC();
      sourceNode = audioContext.createMediaElementSource(audio);
      let previous = sourceNode;
      filters = bands.map((band) => {
        const node = audioContext.createBiquadFilter();
        node.type = band.type;
        node.frequency.value = Math.min(band.freq, audioContext.sampleRate / 2 - 1);
        node.Q.value = 1;
        node.gain.value = 0;
        previous.connect(node);
        previous = node;
        return node;
      });
      window.masterGain = audioContext.createGain();
      window.masterGain.gain.value = Number($("volume").value) / 100;
      previous.connect(window.masterGain);
      window.masterGain.connect(audioContext.destination);
      audio.volume = 1;
      applyEQ();
    }
    if (audioContext.state === "suspended") await audioContext.resume();
  };
  // Volume event references the dedicated gain, whether or not the graph already exists.
  $("volume").addEventListener("input", e => {
    const v = Number(e.target.value) / 100;
    if (window.masterGain) window.masterGain.gain.value = v;
  });

  async function init() {
    buildEQ();
    try {
      tracks = await dbGetAll();
      tracks.sort((a,b) => a.addedAt - b.addedAt);
      renderPlaylist();
      if (tracks.length) showToast(`已載入 ${tracks.length} 首本機歌曲`);
    } catch (err) {
      showToast("本機音樂資料庫無法開啟，請使用 Safari/Chrome 最新版本。");
    }
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }
  init();
})();