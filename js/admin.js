import { supabase } from "./supabaseClient.js";

const $ = id => document.getElementById(id);
let adminInfo = null;
let membersCache = [];

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}
function roleLabel(role, globalAdmin){
  if(globalAdmin) return "Tổng quản";
  return ({owner:"Chủ QĐ",co_owner:"Quyền chủ",veteran:"Kỳ cựu",member:"Thành viên"})[role] || role;
}
function fmtDate(v){
  if(!v) return "—";
  try{return new Date(v).toLocaleString("vi-VN");}catch{return "—";}
}
function hideAll(){
  $("loginPanel").classList.add("hidden");
  $("noAccess").classList.add("hidden");
  $("adminPanel").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  $("adminIdentity").classList.add("hidden");
}
function showLogin(message=""){
  hideAll();
  $("loginPanel").classList.remove("hidden");
  $("loginError").classList.toggle("hidden", !message);
  $("loginError").textContent = message;
}
async function rpc(name,args={}){
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw error;
  return data;
}

async function loadAdminInfo(){
  return await rpc("get_admin_context");
}

async function loadStats(){
  const s = await rpc("admin_dashboard_stats");
  $("statMembers").textContent = s.member_count ?? 0;
  $("statPending").textContent = s.pending_count ?? 0;
  $("statVoice").textContent = s.voice_count ?? 0;
  $("statWatch").textContent = s.watch_count ?? 0;
  $("pendingBadge").textContent = s.pending_count ?? 0;
}

async function loadRequests(){
  $("requests").innerHTML = '<div class="skeleton request-skeleton"></div>';
  const data = await rpc("list_pending_membership_requests");
  $("pendingBadge").textContent = data?.length || 0;

  if(!data?.length){
    $("requests").innerHTML = '<div class="empty-state">Không có yêu cầu nào đang chờ duyệt.</div>';
    return;
  }

  $("requests").innerHTML = data.map(r=>`
    <article class="request-card">
      <div class="request-main"><b>${esc(r.display_name)}</b><small>Gửi ${fmtDate(r.created_at)}</small></div>
      <div class="request-cell"><small>UID</small><b>${esc(r.freefire_uid)}</b></div>
      <div class="request-cell"><small>Nhánh</small><b>${esc(r.branch_name)}</b></div>
      <div class="request-actions">
        <button class="primary" data-request-action="approve" data-id="${r.id}">Duyệt</button>
        <button class="danger" data-request-action="reject" data-id="${r.id}">Từ chối</button>
      </div>
    </article>`).join("");
}

async function loadMembers(search=""){
  $("membersList").innerHTML = '<div class="skeleton request-skeleton"></div>';
  membersCache = await rpc("admin_list_members",{search_text:search});

  if(!membersCache?.length){
    $("membersList").innerHTML = '<div class="empty-state">Không tìm thấy thành viên.</div>';
    return;
  }

  $("membersList").innerHTML = membersCache.map(m=>`
    <article class="admin-member-card">
      <div class="admin-member-avatar">${esc((m.display_name||"?").slice(0,1).toUpperCase())}</div>
      <div class="admin-member-main">
        <b>${esc(m.display_name)}</b>
        <small>${esc(m.ingame_name || "—")} · UID ${esc(m.freefire_uid)}</small>
      </div>
      <div class="admin-member-meta">
        <span>${esc(m.branch_name)}</span>
        <span>${esc(roleLabel(m.role,m.is_global_admin))}</span>
        <span class="${m.is_online ? "status-online" : ""}">${m.is_online ? "● Online" : "Offline"}</span>
      </div>
      <div class="admin-member-actions">
        <button class="secondary" data-member-action="edit" data-id="${m.id}">Đổi tên</button>
        <button class="danger" data-member-action="delete" data-id="${m.id}" ${m.is_global_admin ? "disabled" : ""}>Xóa</button>
      </div>
    </article>`).join("");
}

async function loadRooms(){
  $("roomsList").innerHTML = '<div class="skeleton request-skeleton"></div>';
  const rooms = await rpc("admin_list_rooms");

  if(!rooms?.length){
    $("roomsList").innerHTML = '<div class="empty-state">Hiện không có phòng nào đang hoạt động.</div>';
    return;
  }

  $("roomsList").innerHTML = rooms.map(r=>`
    <article class="admin-room-card">
      <div class="admin-room-icon">${r.room_type === "voice" ? "🎧" : "🎬"}</div>
      <div class="admin-room-main">
        <b>${esc(r.name)}</b>
        <small>${r.room_type === "voice" ? "VOICE" : "WATCH PARTY"} · Host ${esc(r.host_name)}</small>
      </div>
      <div class="admin-room-meta">
        <span>${esc(r.branch_name)}</span>
        <span>Hết hạn ${fmtDate(r.expires_at)}</span>
      </div>
      <button class="danger" data-room-delete="${r.room_type}" data-id="${r.id}">Xóa room</button>
    </article>`).join("");
}

async function refreshAll(){
  await Promise.all([loadStats(),loadRequests(),loadMembers($("memberSearch").value.trim()),loadRooms()]);
}

async function openAdmin(){
  hideAll();
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError || !userData.user || userData.user.is_anonymous) return showLogin();

  adminInfo = await loadAdminInfo();
  $("logoutBtn").classList.remove("hidden");
  $("adminIdentity").textContent = userData.user.email || "Admin";
  $("adminIdentity").classList.remove("hidden");

  if(!adminInfo?.can_access_admin){
    $("noAccess").classList.remove("hidden");
    return;
  }

  $("adminPanel").classList.remove("hidden");
  $("adminScopeText").textContent = adminInfo.is_global_admin
    ? "Tổng quản: quản lý toàn bộ PHOENIX."
    : `Phạm vi quản lý: ${adminInfo.branch_name}.`;

  await refreshAll();
}

$("adminLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("loginError").classList.add("hidden");
  $("loginBtn").disabled=true;
  try{
    const {error}=await supabase.auth.signInWithPassword({
      email:$("adminEmail").value.trim(),
      password:$("adminPassword").value
    });
    if(error) throw error;
    await openAdmin();
  }catch(err){
    $("loginError").textContent=err.message || "Đăng nhập thất bại.";
    $("loginError").classList.remove("hidden");
  }finally{$("loginBtn").disabled=false;}
});

document.querySelectorAll(".admin-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".admin-tab-panel").forEach(x=>x.classList.add("hidden"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

$("requests").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-request-action]");
  if(!btn) return;
  btn.disabled=true;
  try{
    const fn=btn.dataset.requestAction==="approve" ? "approve_membership_request_v5" : "reject_membership_request";
    const data=await rpc(fn,{request_id:btn.dataset.id});
    if(!data?.ok) throw new Error(data?.message || "Không thể xử lý.");
    await Promise.all([loadRequests(),loadStats(),loadMembers()]);
  }catch(err){alert(err.message);}finally{btn.disabled=false;}
});

$("membersList").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-member-action]");
  if(!btn) return;
  const m=membersCache.find(x=>x.id===btn.dataset.id);
  if(!m) return;

  if(btn.dataset.memberAction==="edit"){
    $("editMemberId").value=m.id;
    $("editDisplayName").value=m.display_name || "";
    $("editIngameName").value=m.ingame_name || "";
    $("editMemberError").classList.add("hidden");
    $("editMemberModal").classList.remove("hidden");
    document.body.classList.add("modal-open");
    return;
  }

  if(btn.dataset.memberAction==="delete"){
    if(!confirm(`Xóa thành viên "${m.display_name}"?\n\nThao tác này sẽ xóa hồ sơ thành viên và các room do người này tạo.`)) return;
    btn.disabled=true;
    try{
      const data=await rpc("admin_delete_member",{target_member_id:m.id});
      if(!data?.ok) throw new Error(data?.message || "Không thể xóa.");
      await Promise.all([loadMembers($("memberSearch").value.trim()),loadRooms(),loadStats()]);
    }catch(err){alert(err.message);}finally{btn.disabled=false;}
  }
});

$("roomsList").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-room-delete]");
  if(!btn) return;
  const type=btn.dataset.roomDelete;
  if(!confirm(`Xóa ${type==="voice"?"phòng Voice":"Watch Party"} này?`)) return;
  btn.disabled=true;
  try{
    const data=await rpc("admin_delete_room",{room_type:type,target_room_id:btn.dataset.id});
    if(!data?.ok) throw new Error(data?.message || "Không thể xóa room.");
    await Promise.all([loadRooms(),loadStats()]);
  }catch(err){alert(err.message);}finally{btn.disabled=false;}
});

$("editMemberForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("editMemberSave").disabled=true;
  $("editMemberError").classList.add("hidden");
  try{
    const data=await rpc("admin_rename_member",{
      target_member_id:$("editMemberId").value,
      new_display_name:$("editDisplayName").value.trim(),
      new_ingame_name:$("editIngameName").value.trim()
    });
    if(!data?.ok) throw new Error(data?.message || "Không thể đổi tên.");
    $("editMemberModal").classList.add("hidden");
    document.body.classList.remove("modal-open");
    await loadMembers($("memberSearch").value.trim());
  }catch(err){
    $("editMemberError").textContent=err.message;
    $("editMemberError").classList.remove("hidden");
  }finally{$("editMemberSave").disabled=false;}
});

$("editMemberClose").onclick=()=>{
  $("editMemberModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
};
$("memberSearchBtn").onclick=()=>loadMembers($("memberSearch").value.trim());
$("memberSearch").addEventListener("keydown",e=>{if(e.key==="Enter") loadMembers(e.target.value.trim());});
$("refreshAllBtn").onclick=refreshAll;
$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();showLogin();};
$("switchAccountBtn").onclick=async()=>{await supabase.auth.signOut();showLogin();};

openAdmin().catch(err=>{
  console.error("Admin init:",err);
  showLogin(err.message || "Không thể mở BQT.");
});
