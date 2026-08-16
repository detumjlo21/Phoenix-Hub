import { Room, RoomEvent, Track } from "https://cdn.jsdelivr.net/npm/livekit-client@2.15.6/+esm";
import { supabase } from "./supabaseClient.js";

let member = null;
let room = null;
let activeRoomMeta = null;
let selectedRoom = null;

const roomsBox = document.getElementById("voiceRooms");
const modal = document.getElementById("voiceModal");
const createForm = document.getElementById("createVoiceForm");
const joinPanel = document.getElementById("joinVoicePanel");
const activePanel = document.getElementById("activeVoicePanel");
const errorBox = document.getElementById("voiceError");

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}
function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}
function clearError(){ errorBox.classList.add("hidden"); }
function openModal(){
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closeModal(){
  if(room) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  clearError();
}
function showCreate(){
  selectedRoom = null;
  document.getElementById("voiceModalTitle").textContent = "Tạo phòng voice";
  createForm.classList.remove("hidden");
  joinPanel.classList.add("hidden");
  activePanel.classList.add("hidden");
  openModal();
}
function showJoin(meta){
  selectedRoom = meta;
  document.getElementById("voiceModalTitle").textContent = "Vào phòng voice";
  createForm.classList.add("hidden");
  activePanel.classList.add("hidden");
  joinPanel.classList.remove("hidden");
  document.getElementById("joinVoiceText").textContent = `${meta.name} • Host: ${meta.host_name}`;
  document.getElementById("joinPasswordWrap").classList.toggle("hidden", !meta.has_password);
  document.getElementById("joinVoicePassword").value = "";
  openModal();
}
function formatLeft(iso){
  const ms = new Date(iso).getTime() - Date.now();
  if(ms <= 0) return "Hết hạn";
  const mins = Math.ceil(ms/60000);
  if(mins < 60) return `${mins} phút`;
  const hrs = Math.ceil(mins/60);
  return `${hrs} giờ`;
}

export async function initVoice(currentMember){
  member = currentMember;
  document.getElementById("createVoiceBtn").addEventListener("click", showCreate);
  document.getElementById("voiceModalClose").addEventListener("click", closeModal);
  document.getElementById("leaveVoiceBtn").addEventListener("click", leaveVoice);
  document.getElementById("micBtn").addEventListener("click", toggleMic);
  document.getElementById("closeRoomBtn").addEventListener("click", closeActiveRoom);
  document.getElementById("joinVoiceConfirm").addEventListener("click", () => {
    const pw = document.getElementById("joinVoicePassword").value;
    connectToRoom(selectedRoom.id, pw);
  });

  createForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearError();
    try{
      const { data, error } = await supabase.rpc("create_voice_room", {
        room_name: document.getElementById("voiceRoomName").value.trim(),
        room_password: document.getElementById("voiceRoomPassword").value,
        room_max: Number(document.getElementById("voiceRoomMax").value),
        duration_minutes: Number(document.getElementById("voiceRoomDuration").value)
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.message || "Không thể tạo phòng.");
      await loadVoiceRooms();
      await connectToRoom(data.id, document.getElementById("voiceRoomPassword").value);
      createForm.reset();
    }catch(err){ showError(err.message || "Không thể tạo phòng."); }
  });

  await loadVoiceRooms();
  setInterval(loadVoiceRooms, 30000);
}

export async function loadVoiceRooms(){
  if(!member) return;
  const { data, error } = await supabase.rpc("list_voice_rooms");
  if(error){
    roomsBox.innerHTML = `<div class="empty-card"><b>Không tải được phòng voice</b><p>${esc(error.message)}</p></div>`;
    return;
  }
  if(!data?.length){
    roomsBox.innerHTML = `<div class="empty-card"><div class="big-icon">🎧</div><b>Chưa có phòng voice</b><p>Bất kỳ thành viên đã duyệt nào cũng có thể tạo phòng.</p></div>`;
    return;
  }
  roomsBox.innerHTML = data.map(r => `
    <article class="voice-card">
      <div class="voice-card-icon">🎧</div>
      <div class="voice-card-main">
        <b>${esc(r.name)}</b>
        <small>Host: ${esc(r.host_name)} • tối đa ${r.max_participants} • còn ${formatLeft(r.expires_at)}</small>
      </div>
      <span class="voice-lock">${r.has_password ? "🔒" : "🌐"}</span>
      <button class="primary voice-join" data-room="${r.id}">Vào</button>
    </article>
  `).join("");
  roomsBox.querySelectorAll("[data-room]").forEach(btn => {
    btn.addEventListener("click", () => {
      const meta = data.find(x => x.id === btn.dataset.room);
      showJoin(meta);
    });
  });
}

async function connectToRoom(roomId, password=""){
  clearError();
  try{
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if(!accessToken) throw new Error("Phiên đăng nhập đã hết hạn.");

    const response = await fetch("/api/livekit-token", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${accessToken}`
      },
      body:JSON.stringify({roomId,password})
    });
    const payload = await response.json();
    if(!response.ok) throw new Error(payload.error || "Không thể lấy token voice.");

    if(room) await room.disconnect();

    room = new Room({ adaptiveStream:true, dynacast:true });
    activeRoomMeta = {...payload.room, isHost: payload.isHost};

    room.on(RoomEvent.ParticipantConnected, renderParticipants);
    room.on(RoomEvent.ParticipantDisconnected, renderParticipants);
    room.on(RoomEvent.TrackMuted, renderParticipants);
    room.on(RoomEvent.TrackUnmuted, renderParticipants);
    room.on(RoomEvent.Disconnected, () => {
      room = null;
      activeRoomMeta = null;
      document.body.classList.remove("modal-open");
      modal.classList.add("hidden");
      loadVoiceRooms();
    });

    await room.connect(payload.url, payload.token);
    await room.localParticipant.setMicrophoneEnabled(true);

    createForm.classList.add("hidden");
    joinPanel.classList.add("hidden");
    activePanel.classList.remove("hidden");
    document.getElementById("voiceModalTitle").textContent = "Đang trong voice";
    document.getElementById("activeVoiceName").textContent = payload.room.name;
    document.getElementById("activeVoiceState").textContent = "Đã kết nối LiveKit";
    document.getElementById("closeRoomBtn").classList.toggle("hidden", !payload.isHost);
    document.getElementById("micBtn").textContent = "🎙 Tắt mic";
    openModal();
    renderParticipants();
  }catch(err){
    showError(err.message || "Không thể vào voice.");
  }
}

function renderParticipants(){
  if(!room) return;
  const people = [room.localParticipant, ...room.remoteParticipants.values()];
  document.getElementById("voiceParticipants").innerHTML = people.map(p => {
    const mic = p.getTrackPublication(Track.Source.Microphone);
    const muted = !mic || mic.isMuted;
    const name = p.name || p.identity;
    return `<div class="participant"><span>${muted ? "🔇" : "🎙️"}</span><b>${esc(name)}</b>${p === room.localParticipant ? "<small>Bạn</small>" : ""}</div>`;
  }).join("");
}

async function toggleMic(){
  if(!room) return;
  const enabled = room.localParticipant.isMicrophoneEnabled;
  await room.localParticipant.setMicrophoneEnabled(!enabled);
  document.getElementById("micBtn").textContent = enabled ? "🎙 Bật mic" : "🎙 Tắt mic";
  renderParticipants();
}

async function leaveVoice(){
  if(!room) return closeModal();
  await room.disconnect();
}

async function closeActiveRoom(){
  if(!activeRoomMeta?.isHost) return;
  try{
    const { data, error } = await supabase.rpc("close_voice_room", { target_room_id: activeRoomMeta.id });
    if(error) throw error;
    if(!data?.ok) throw new Error("Không thể đóng phòng.");
    await leaveVoice();
    await loadVoiceRooms();
  }catch(err){ showError(err.message); }
}
