import { supabase } from "./supabaseClient.js";

const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("adminLoginForm");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const noAccess = document.getElementById("noAccess");
const adminPanel = document.getElementById("adminPanel");
const requestsBox = document.getElementById("requests");
const pendingCount = document.getElementById("pendingCount");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const switchAccountBtn = document.getElementById("switchAccountBtn");
const adminIdentity = document.getElementById("adminIdentity");

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

function hideAll(){
  loginPanel.classList.add("hidden");
  noAccess.classList.add("hidden");
  adminPanel.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  adminIdentity.classList.add("hidden");
}

function showLogin(message = ""){
  hideAll();
  loginPanel.classList.remove("hidden");
  if(message){
    loginError.textContent = message;
    loginError.classList.remove("hidden");
  }else{
    loginError.classList.add("hidden");
  }
}

async function loadAdminInfo(){
  const { data, error } = await supabase.rpc("get_admin_context");
  if(error) throw error;
  return data;
}

async function loadRequests(){
  requestsBox.innerHTML = '<div class="skeleton request-skeleton"></div>';
  const { data, error } = await supabase.rpc("list_pending_membership_requests");
  if(error) throw error;

  pendingCount.textContent = data?.length || 0;

  if(!data?.length){
    requestsBox.innerHTML = '<div class="empty-state">Không có yêu cầu nào đang chờ duyệt.</div>';
    return;
  }

  requestsBox.innerHTML = data.map(r => `
    <article class="request-card">
      <div class="request-main">
        <b>${esc(r.display_name)}</b>
        <small>Gửi ${new Date(r.created_at).toLocaleString("vi-VN")}</small>
      </div>
      <div class="request-cell">
        <small>UID</small>
        <b>${esc(r.freefire_uid)}</b>
      </div>
      <div class="request-cell">
        <small>Nhánh</small>
        <b>${esc(r.branch_name)}</b>
      </div>
      <div class="request-actions">
        <button class="primary" data-action="approve" data-id="${r.id}">Duyệt</button>
        <button class="danger" data-action="reject" data-id="${r.id}">Từ chối</button>
      </div>
    </article>
  `).join("");
}

async function openAdmin(){
  hideAll();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if(userError || !userData.user || userData.user.is_anonymous){
    showLogin();
    return;
  }

  const info = await loadAdminInfo();

  logoutBtn.classList.remove("hidden");
  adminIdentity.textContent = userData.user.email || "Admin";
  adminIdentity.classList.remove("hidden");

  if(!info?.can_access_admin){
    noAccess.classList.remove("hidden");
    return;
  }

  adminPanel.classList.remove("hidden");
  await loadRequests();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  loginBtn.disabled = true;
  loginBtn.textContent = "Đang đăng nhập...";

  try{
    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) throw error;

    await openAdmin();
  }catch(err){
    loginError.textContent = err.message || "Đăng nhập thất bại.";
    loginError.classList.remove("hidden");
  }finally{
    loginBtn.disabled = false;
    loginBtn.textContent = "Đăng nhập BQT";
  }
});

requestsBox.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if(!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  btn.disabled = true;

  try{
    const fn = action === "approve"
      ? "approve_membership_request"
      : "reject_membership_request";

    const { data, error } = await supabase.rpc(fn, { request_id:id });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.message || "Không thể xử lý yêu cầu.");
    await loadRequests();
  }catch(err){
    alert(err.message || "Có lỗi.");
    btn.disabled = false;
  }
});

refreshBtn.addEventListener("click", loadRequests);

async function logoutAndShowLogin(){
  await supabase.auth.signOut();
  showLogin();
}

logoutBtn.addEventListener("click", logoutAndShowLogin);
switchAccountBtn.addEventListener("click", logoutAndShowLogin);

openAdmin().catch(err => {
  console.error("Admin init error:", err);
  showLogin(err.message || "Không thể kiểm tra quyền BQT.");
});
