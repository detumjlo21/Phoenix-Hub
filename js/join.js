import { supabase, ensureAnonymousSession } from "./supabaseClient.js";

const form = document.getElementById("joinForm");
const branchSelect = document.getElementById("branchId");
const statusBox = document.getElementById("statusBox");
const errorBox = document.getElementById("joinError");
const submitBtn = document.getElementById("submitBtn");

let currentRequest = null;
let currentMember = null;

function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function setStatus(req){
  currentRequest = req;
  statusBox.className = "status-box";
  statusBox.classList.remove("hidden");

  if(req.status === "pending"){
    statusBox.textContent = `🟡 Yêu cầu đang chờ BQT duyệt. Gửi lúc ${new Date(req.created_at).toLocaleString("vi-VN")}.`;
    submitBtn.textContent = "Cập nhật yêu cầu";
  }else if(req.status === "approved"){
    statusBox.classList.add("approved");
    statusBox.innerHTML = `✅ Bạn đã được duyệt. <a href="./" style="color:inherit">Vào PHOENIX Hub</a>`;
    form.classList.add("hidden");
  }else if(req.status === "rejected"){
    statusBox.classList.add("rejected");
    statusBox.textContent = "❌ Yêu cầu trước chưa được duyệt. Bạn có thể sửa thông tin và gửi lại.";
    submitBtn.textContent = "Gửi lại yêu cầu";
  }
}

async function loadBranches(){
  const { data, error } = await supabase.from("branches").select("id,name").order("id");
  if(error) throw error;

  branchSelect.innerHTML = `<option value="">Chọn nhánh</option>` +
    data.map(b=>`<option value="${b.id}">${b.name}</option>`).join("");
}

async function loadIdentity(){
  const { data: auth } = await supabase.auth.getUser();
  if(!auth.user) return;

  const [{ data: member }, { data: req }] = await Promise.all([
    supabase.from("members")
      .select("id,display_name,freefire_uid,branch_id")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle(),
    supabase.from("membership_requests")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle()
  ]);

  currentMember = member;
  if(member){
    statusBox.className = "status-box approved";
    statusBox.innerHTML = `✅ Thiết bị này đã được duyệt cho <b>${member.display_name}</b>. <a href="./" style="color:inherit">Vào PHOENIX Hub</a>`;
    statusBox.classList.remove("hidden");
    form.classList.add("hidden");
    return;
  }

  if(req){
    setStatus(req);
    document.getElementById("displayName").value = req.display_name || "";
    document.getElementById("freefireUid").value = req.freefire_uid || "";
    branchSelect.value = String(req.branch_id || "");
  }
}

form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  errorBox.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Đang gửi...";

  try{
    const payload = {
      member_display_name: document.getElementById("displayName").value.trim(),
      member_freefire_uid: document.getElementById("freefireUid").value.trim(),
      desired_branch_id: Number(branchSelect.value)
    };

    const { data, error } = await supabase.rpc("submit_membership_request", payload);
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.message || "Không thể gửi yêu cầu.");

    location.reload();
  }catch(err){
    showError(err.message || "Có lỗi xảy ra.");
    submitBtn.disabled = false;
    submitBtn.textContent = currentRequest ? "Cập nhật yêu cầu" : "Gửi yêu cầu cho BQT";
  }
});

async function init(){
  try{
    await ensureAnonymousSession();
    await loadBranches();
    await loadIdentity();
  }catch(err){
    showError(err.message || "Không thể kết nối Supabase.");
  }
}

init();
