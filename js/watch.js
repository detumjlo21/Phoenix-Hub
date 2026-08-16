import { supabase } from "./supabaseClient.js";
import { Room, RoomEvent, Track } from "https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/+esm";

let me, selectedRoom, activeRoom, channel, player, playerReady = false;
let suppressUntil = 0, syncTimer = null, hostPublishTimer = null;
let watchVoice = null, currentPassword = "";

const $ = id => document.getElementById(id);
const errBox = () => $("watchError");

function showError(msg){
  const e = errBox();
  e.textContent = msg;
  e.classList.remove("hidden");
}
function clearError(){
  errBox().classList.add("hidden");
  errBox().textContent = "";
}
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function ytId(input){
  try{
    const u = new URL(input.trim());
    if(u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if(u.hostname.includes("youtube.com")){
      if(u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
      if(m) return m[1];
    }
  }catch{}
  return /^[A-Za-z0-9_-]{11}$/.test(input.trim()) ? input.trim() : null;
}
function openModal(){
  $("watchModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closeModal(){
  if(activeRoom) {
    leaveRoom();
    return;
  }
  $("watchModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
  resetPanels();
}
function resetPanels(){
  ["createWatchForm","joinWatchPanel","activeWatchPanel"].forEach(id => $(id).classList.add("hidden"));
  clearError();
}

async function listRooms(){
  const { data, error } = await supabase.rpc("list_watch_rooms");
  if(error){
    $("watchRooms").innerHTML =
      `<div class="empty-card"><b>Không tải được phòng xem phim</b><p>${esc(error.message)}</p></div>`;
    return;
  }

  const box = $("watchRooms");
  if(!data?.length){
    box.innerHTML =
      '<div class="empty-card"><div class="big-icon">🎬</div><b>Chưa có phòng xem phim</b><p>Tạo phòng YouTube đầu tiên và xem cùng anh em.</p></div>';
    return;
  }

  box.innerHTML = data.map(r => `
    <article class="watch-card">
      <img src="https://i.ytimg.com/vi/${r.youtube_id}/mqdefault.jpg" alt="">
      <div class="watch-card-main">
        <b>${esc(r.name)}</b>
        <small>Host: ${esc(r.host_name)} · YouTube · Mic</small>
      </div>
      <span>${r.has_password ? "🔒" : "🌐"}</span>
      <button class="primary watch-join" data-id="${r.id}">Vào xem</button>
    </article>
  `).join("");

  box.querySelectorAll(".watch-join").forEach(btn => {
    btn.onclick = () => prepareJoin(data.find(r => r.id === btn.dataset.id));
  });
}

function showCreate(){
  selectedRoom = null;
  resetPanels();
  $("createWatchForm").classList.remove("hidden");
  $("watchModalTitle").textContent = "Tạo phòng xem phim";
  openModal();
}

function prepareJoin(r){
  selectedRoom = r;
  resetPanels();
  $("joinWatchPanel").classList.remove("hidden");
  $("watchModalTitle").textContent = "Vào phòng xem phim";
  $("joinWatchText").textContent = `${r.name} · Host: ${r.host_name}`;
  $("joinWatchPasswordWrap").classList.toggle("hidden", !r.has_password);
  $("joinWatchPassword").value = "";
  openModal();
}

async function createRoom(ev){
  ev.preventDefault();
  clearError();

  const id = ytId($("watchYoutubeUrl").value);
  if(!id) return showError("Link YouTube không hợp lệ.");

  const password = $("watchRoomPassword").value || "";

  const { data, error } = await supabase.rpc("create_watch_room", {
    room_name: $("watchRoomName").value,
    youtube_video_id: id,
    room_password: password,
    duration_minutes: Number($("watchRoomDuration").value)
  });

  if(error) return showError(error.message);

  await listRooms();
  const rooms = (await supabase.rpc("list_watch_rooms")).data || [];
  const r = rooms.find(x => x.id === data.id);
  if(r) await enterRoom(r, password);
}

async function joinSelected(){
  if(!selectedRoom) return;
  await enterRoom(selectedRoom, $("joinWatchPassword").value || "");
}

async function enterRoom(r, password){
  clearError();

  const { data, error } = await supabase.rpc("join_watch_room", {
    target_room_id: r.id,
    room_password: password
  });

  if(error) return showError(error.message);
  if(!data?.ok) return showError(data?.message || "Không vào được phòng.");

  currentPassword = password;
  activeRoom = { ...data.room, isHost: data.is_host };

  resetPanels();
  $("activeWatchPanel").classList.remove("hidden");
  $("watchModalTitle").textContent = activeRoom.isHost ? "Bạn đang Host Watch Party" : "Đang xem cùng Host";
  $("activeWatchName").textContent = activeRoom.name;
  $("activeWatchHost").textContent = activeRoom.isHost
    ? "👑 Bạn là Host · Video do bạn điều khiển"
    : `👑 Host: ${activeRoom.hostName} · Video tự đồng bộ`;

  $("closeWatchRoomBtn").classList.toggle("hidden", !activeRoom.isHost);
  $("watchHostBadge").classList.toggle("hidden", !activeRoom.isHost);
  $("watchViewerBadge").classList.toggle("hidden", activeRoom.isHost);

  openModal();

  await setupRealtime();
  await loadPlayer();

  // Voice không được phép làm hỏng Watch Party:
  // nếu mic bị từ chối, user vẫn xem video bình thường.
  connectWatchVoice(password).catch(err => {
    console.warn("Watch voice:", err);
    setWatchVoiceStatus("Mic chưa bật", false);
  });

  startSyncLoop();
}

async function ensureYT(){
  if(window.YT?.Player) return;
  await new Promise(resolve => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
}

async function loadPlayer(){
  await ensureYT();
  playerReady = false;
  $("youtubePlayer").innerHTML = "";

  const isHost = activeRoom.isHost;

  player = new YT.Player("youtubePlayer", {
    videoId: activeRoom.youtubeId,
    host: "https://www.youtube.com",
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      controls: isHost ? 1 : 0,
      disablekb: isHost ? 0 : 1,
      fs: 1,

      // Quan trọng cho YouTube Error 153:
      // xác định rõ website đang nhúng player.
      origin: window.location.origin,
      widget_referrer: window.location.href
    },
    events: {
      onReady: () => {
        playerReady = true;

        // Bảo đảm video thực sự được load sau khi iframe sẵn sàng.
        try{
          player.cueVideoById({
            videoId: activeRoom.youtubeId,
            startSeconds: Math.max(0, expectedPosition(activeRoom))
          });
        }catch(e){
          console.warn("cueVideoById:", e);
        }

        setTimeout(() => {
          applyState(activeRoom, true);
        }, 250);

        $("viewerControlLock").classList.toggle("hidden", isHost);
      },
      onStateChange: onPlayerState,
      onError: onYoutubeError
    }
  });
}

function onPlayerState(e){
  if(!activeRoom?.isHost || Date.now() < suppressUntil) return;

  if(e.data === YT.PlayerState.PLAYING){
    sendState("playing");
  }else if(e.data === YT.PlayerState.PAUSED){
    sendState("paused");
  }
}

function onYoutubeError(e){
  const messages = {
    2: "Link/video YouTube không hợp lệ.",
    5: "Trình duyệt không phát được video HTML5 này.",
    100: "Video đã bị xóa hoặc đặt riêng tư.",
    101: "Chủ video không cho phép phát trên website khác.",
    150: "Chủ video không cho phép phát trên website khác.",
    153: "YouTube không nhận diện được website nhúng player."
  };

  const message = messages[e.data] || `YouTube Player Error ${e.data}`;
  console.error("YouTube player error:", e.data);

  if(e.data === 153){
    showError(
      message +
      " Hãy mở PHOENIX Hub bằng Chrome/Safari thay vì trình duyệt bên trong Messenger nếu lỗi vẫn xuất hiện."
    );
  }else{
    showError(message);
  }
}

async function sendState(status){
  if(!activeRoom?.isHost || !playerReady) return;

  const pos = player.getCurrentTime() || 0;
  const { data, error } = await supabase.rpc("update_watch_state", {
    target_room_id: activeRoom.id,
    new_status: status,
    new_position: pos
  });

  if(error) return showError(error.message);

  activeRoom = { ...activeRoom, ...data.state };

  await channel?.send({
    type: "broadcast",
    event: "sync",
    payload: data.state
  });
}

function expectedPosition(st){
  let pos = Number(st.position || 0);
  if(st.status === "playing" && st.updatedAt){
    pos += Math.max(0, (Date.now() - new Date(st.updatedAt).getTime()) / 1000);
  }
  return pos;
}

function applyState(st, force = false){
  if(!playerReady || !st) return;

  suppressUntil = Date.now() + 900;
  const pos = expectedPosition(st);
  const here = Number(player.getCurrentTime?.() || 0);
  const drift = Math.abs(here - pos);

  // Viewer luôn bị kéo về Host nếu lệch > 1.4s.
  // Host chỉ seek khi vừa load room.
  if(force || (!activeRoom.isHost && drift > 1.4)){
    player.seekTo(Math.max(0, pos), true);
  }

  if(!activeRoom.isHost){
    if(st.status === "playing") player.playVideo();
    else player.pauseVideo();
  }else if(force){
    if(st.status === "playing") player.playVideo();
    else player.pauseVideo();
  }

  $("watchSyncState").textContent = activeRoom.isHost
    ? "Host đang phát trạng thái cho mọi người"
    : `Đang theo Host · lệch ${drift.toFixed(1)}s`;
}

async function refreshViewerState(){
  if(!activeRoom || activeRoom.isHost) return;

  const { data, error } = await supabase.rpc("join_watch_room", {
    target_room_id: activeRoom.id,
    room_password: currentPassword
  });

  if(error || !data?.room) return;
  activeRoom = { ...activeRoom, ...data.room, isHost: false };
  applyState(data.room);
}

function startSyncLoop(){
  clearInterval(syncTimer);
  clearInterval(hostPublishTimer);

  if(activeRoom.isHost){
    hostPublishTimer = setInterval(() => {
      if(!playerReady || !activeRoom) return;
      const state = player.getPlayerState();
      const status = state === YT.PlayerState.PLAYING ? "playing" : "paused";
      sendState(status);
    }, 2500);
  }else{
    syncTimer = setInterval(refreshViewerState, 2000);
  }
}

async function setupRealtime(){
  if(channel) await supabase.removeChannel(channel);

  channel = supabase.channel(`watch:${activeRoom.id}`, {
    config: { presence: { key: me.id } }
  });

  channel
    .on("presence", { event: "sync" }, renderPresence)
    .on("broadcast", { event: "sync" }, ({ payload }) => {
      if(!activeRoom?.isHost) applyState(payload);
    })
    .on("broadcast", { event: "closed" }, () => {
      showError("Host đã đóng phòng.");
      setTimeout(leaveRoom, 1200);
    });

  await channel.subscribe(async status => {
    if(status === "SUBSCRIBED"){
      await channel.track({ name: me.display_name, at: Date.now() });
    }
  });
}

function renderPresence(){
  const state = channel?.presenceState() || {};
  const people = Object.values(state).flat();
  $("watchMemberCount").textContent = people.length;

  // Fallback danh sách nếu LiveKit mic chưa kết nối.
  if(!watchVoice){
    $("watchParticipants").innerHTML =
      people.map(p => `<span>${esc(p.name)}</span>`).join("");
  }
}

/* =========================
   WATCH PARTY LIVEKIT VOICE
   ========================= */

function setWatchVoiceStatus(text, ok = true){
  $("watchVoiceState").textContent = text;
  $("watchVoiceDot").classList.toggle("off", !ok);
}

async function connectWatchVoice(password){
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if(!accessToken) throw new Error("Phiên đăng nhập đã hết hạn.");

  const response = await fetch("/api/watch-livekit-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      roomId: activeRoom.id,
      password
    })
  });

  const payload = await response.json();
  if(!response.ok) throw new Error(payload.error || "Không kết nối được voice.");

  watchVoice = new Room({ adaptiveStream: true, dynacast: true });

  watchVoice.on(RoomEvent.ParticipantConnected, renderVoicePeople);
  watchVoice.on(RoomEvent.ParticipantDisconnected, renderVoicePeople);
  watchVoice.on(RoomEvent.TrackMuted, renderVoicePeople);
  watchVoice.on(RoomEvent.TrackUnmuted, renderVoicePeople);
  watchVoice.on(RoomEvent.ActiveSpeakersChanged, renderVoicePeople);

  watchVoice.on(RoomEvent.TrackSubscribed, track => {
    if(track.kind === Track.Kind.Audio){
      const audio = track.attach();
      audio.autoplay = true;
      audio.dataset.watchPartyAudio = "1";
      document.body.appendChild(audio);
    }
    renderVoicePeople();
  });

  watchVoice.on(RoomEvent.TrackUnsubscribed, track => {
    track.detach().forEach(el => el.remove());
    renderVoicePeople();
  });

  watchVoice.on(RoomEvent.Disconnected, () => {
    document.querySelectorAll("audio[data-watch-party-audio='1']").forEach(el => el.remove());
    watchVoice = null;
    setWatchVoiceStatus("Voice đã ngắt", false);
  });

  await watchVoice.connect(payload.url, payload.token);

  try{ await watchVoice.startAudio(); }catch(e){ console.warn("watch startAudio:", e); }

  // Xin mic sau thao tác Vào xem. Nếu bị từ chối vẫn giữ Watch Party.
  try{
    await watchVoice.localParticipant.setMicrophoneEnabled(true);
    setWatchVoiceStatus("Mic đang bật", true);
  }catch(err){
    console.warn("Microphone permission:", err);
    setWatchVoiceStatus("Chưa cấp quyền mic", false);
  }

  updateWatchMicButton();
  renderVoicePeople();
}

function renderVoicePeople(){
  if(!watchVoice) return;

  const people = [
    watchVoice.localParticipant,
    ...watchVoice.remoteParticipants.values()
  ];

  $("watchMemberCount").textContent = people.length;

  $("watchParticipants").innerHTML = people.map(p => {
    const pub = p.getTrackPublication(Track.Source.Microphone);
    const muted = !pub || pub.isMuted;
    const speaking = p.isSpeaking === true;
    const name = p.name || p.identity;

    return `
      <span class="watch-person ${speaking ? "speaking" : ""}">
        <i>${muted ? "×" : "●"}</i>
        ${esc(name)}
      </span>
    `;
  }).join("");
}

function updateWatchMicButton(){
  if(!watchVoice) return;
  const enabled = watchVoice.localParticipant.isMicrophoneEnabled;
  $("watchMicBtn").classList.toggle("mic-off", !enabled);
  $("watchMicIcon").textContent = enabled ? "🎙" : "🔇";
  $("watchMicLabel").textContent = enabled ? "Tắt mic" : "Bật mic";
}

async function toggleWatchMic(){
  if(!watchVoice){
    try{
      await connectWatchVoice(currentPassword);
    }catch(err){
      return showError(err.message);
    }
    return;
  }

  try{
    const enabled = watchVoice.localParticipant.isMicrophoneEnabled;
    await watchVoice.localParticipant.setMicrophoneEnabled(!enabled);
    setWatchVoiceStatus(enabled ? "Mic đang tắt" : "Mic đang bật", !enabled);
    updateWatchMicButton();
    renderVoicePeople();
  }catch(err){
    showError("Không thể bật mic: " + err.message);
  }
}

async function disconnectWatchVoice(){
  document.querySelectorAll("audio[data-watch-party-audio='1']").forEach(el => el.remove());
  if(watchVoice){
    const r = watchVoice;
    watchVoice = null;
    try{ await r.disconnect(); }catch{}
  }
}

async function closeRoom(){
  if(!activeRoom?.isHost) return;

  const { error } = await supabase.rpc("close_watch_room", {
    target_room_id: activeRoom.id
  });

  if(error) return showError(error.message);

  await channel?.send({
    type: "broadcast",
    event: "closed",
    payload: {}
  });

  await leaveRoom();
  await listRooms();
}

async function leaveRoom(){
  clearInterval(syncTimer);
  clearInterval(hostPublishTimer);
  syncTimer = null;
  hostPublishTimer = null;

  await disconnectWatchVoice();

  if(channel){
    await supabase.removeChannel(channel);
    channel = null;
  }

  try{ player?.destroy(); }catch{}
  player = null;
  playerReady = false;
  activeRoom = null;
  currentPassword = "";

  resetPanels();
  $("watchModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

export async function initWatch(member){
  me = member;

  $("createWatchBtn").onclick = showCreate;
  $("watchModalClose").onclick = closeModal;
  $("createWatchForm").onsubmit = createRoom;
  $("joinWatchConfirm").onclick = joinSelected;
  $("leaveWatchBtn").onclick = leaveRoom;
  $("closeWatchRoomBtn").onclick = closeRoom;
  $("watchMicBtn").onclick = toggleWatchMic;

  await listRooms();

  setInterval(() => {
    if(!activeRoom) listRooms();
  }, 30000);
}
