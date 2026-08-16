import { supabase } from "./supabaseClient.js";

const form = document.getElementById("loginForm");
const btn = document.getElementById("loginBtn");
const errorBox = document.getElementById("loginError");

function normalizeUid(v){
  return String(v || "").trim();
}
function internalEmail(uid){
  return `${uid}@member.phoenix.local`;
}
function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.add("hidden");

  const uid = normalizeUid(document.getElementById("loginUid").value);
  const password = document.getElementById("loginPassword").value;

  if(!/^[0-9A-Za-z_-]{4,24}$/.test(uid)){
    return showError("UID không hợp lệ.");
  }

  btn.disabled = true;
  btn.textContent = "Đang đăng nhập...";

  try{
    const { data, error } = await supabase.auth.signInWithPassword({
      email: internalEmail(uid),
      password
    });
    if(error) throw error;
    if(!data.user) throw new Error("Không thể đăng nhập.");

    const { data: profile, error: profileError } = await supabase.rpc("get_my_member_profile");
    if(profileError) throw profileError;

    if(profile?.ok){
      location.replace("./");
      return;
    }

    const { data: request, error: reqError } = await supabase.rpc("get_my_membership_request_v5");
    if(reqError) throw reqError;

    if(request?.status === "pending"){
      showError("Tài khoản đúng nhưng BQT chưa duyệt yêu cầu của bạn.");
    }else if(request?.status === "rejected"){
      showError("Yêu cầu của bạn đã bị từ chối. Liên hệ BQT nếu cần.");
    }else{
      showError("Tài khoản chưa được liên kết với thành viên PHOENIX.");
    }

    await supabase.auth.signOut();
  }catch(err){
    const msg = String(err?.message || "");
    if(/invalid login credentials/i.test(msg)){
      showError("UID hoặc mật khẩu không đúng.");
    }else{
      showError(msg || "Đăng nhập thất bại.");
    }
  }finally{
    btn.disabled = false;
    btn.textContent = "Đăng nhập PHOENIX";
  }
});
