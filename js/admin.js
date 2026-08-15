import { supabase, ensureAnonymousSession } from "./supabaseClient.js";

const noAccess=document.getElementById("noAccess");
const adminPanel=document.getElementById("adminPanel");
const requestsBox=document.getElementById("requests");
const pendingCount=document.getElementById("pendingCount");
const refreshBtn=document.getElementById("refreshBtn");
const bootstrapBox=document.getElementById("bootstrapBox");
const bootstrapBtn=document.getElementById("bootstrapBtn");

let adminInfo=null;

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

async function loadAdminInfo(){
  const { data, error }=await supabase.rpc("get_admin_context");
  if(error) throw error;
  adminInfo=data;
  return data;
}

async function loadRequests(){
  requestsBox.innerHTML='<div class="skeleton request-skeleton"></div>';
  const { data, error }=await supabase.rpc("list_pending_membership_requests");
  if(error) throw error;

  pendingCount.textContent=data?.length || 0;

  if(!data?.length){
    requestsBox.innerHTML='<div class="empty-state">Không có yêu cầu nào đang chờ duyệt.</div>';
    return;
  }

  requestsBox.innerHTML=data.map(r=>`
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

requestsBox.addEventListener("click",async(e)=>{
  const btn=e.target.closest("button[data-action]");
  if(!btn) return;

  const action=btn.dataset.action;
  const id=btn.dataset.id;
  btn.disabled=true;

  try{
    const fn=action==="approve"?"approve_membership_request":"reject_membership_request";
    const {data,error}=await supabase.rpc(fn,{request_id:id});
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.message || "Không thể xử lý yêu cầu.");
    await loadRequests();
  }catch(err){
    alert(err.message || "Có lỗi.");
    btn.disabled=false;
  }
});

bootstrapBtn.addEventListener("click",async()=>{
  bootstrapBtn.disabled=true;
  try{
    const {data,error}=await supabase.rpc("claim_first_global_admin");
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.message || "Không thể nhận quyền.");
    location.reload();
  }catch(err){
    alert(err.message || "Có lỗi.");
    bootstrapBtn.disabled=false;
  }
});

refreshBtn.addEventListener("click",loadRequests);

async function init(){
  try{
    await ensureAnonymousSession();
    const info=await loadAdminInfo();

    if(!info?.can_access_admin){
      noAccess.classList.remove("hidden");
      return;
    }

    adminPanel.classList.remove("hidden");

    if(info.can_claim_global_admin){
      bootstrapBox.classList.remove("hidden");
    }

    await loadRequests();
  }catch(err){
    console.error(err);
    noAccess.classList.remove("hidden");
  }
}

init();
