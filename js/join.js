import { supabase } from "./supabaseClient.js";

const state = document.getElementById("inviteState");
const form = document.getElementById("joinForm");
const errorBox = document.getElementById("joinError");
const btn = document.getElementById("joinBtn");

const token = new URLSearchParams(location.search).get("token");

function fail(msg){
  state.textContent = "Link mời không sử dụng được.";
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
  form.classList.add("hidden");
}

async function ensureAnonymousSession(){
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

async function init(){
  if(!token) return fail("Thiếu token trong link mời.");

  try{
    await ensureAnonymousSession();

    const { data, error } = await supabase.rpc("preview_invite", { invite_token: token });
    if(error) throw error;
    if(!data?.ok) return fail(data?.message || "Link mời không hợp lệ.");

    state.textContent = `Bạn được mời vào ${data.branch_name}. Nhập tên ingame để hoàn tất.`;
    form.classList.remove("hidden");
  }catch(err){
    fail(err.message || "Không thể kiểm tra link mời.");
  }
}

form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  btn.disabled = true;
  btn.textContent = "Đang tham gia...";

  try{
    const displayName = document.getElementById("displayName").value.trim();
    const uid = document.getElementById("freefireUid").value.trim();

    const { data, error } = await supabase.rpc("claim_invite", {
      invite_token: token,
      member_display_name: displayName,
      member_freefire_uid: uid || null
    });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.message || "Không thể nhận link mời.");

    location.href = "./";
  }catch(err){
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Tham gia PHOENIX";
  }
});

init();
