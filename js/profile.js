import { supabase } from "./supabaseClient.js";

let member = null;
let pendingAvatarUrl = null;

const modal = document.getElementById("profileModal");
const closeBtn = document.getElementById("profileModalClose");
const form = document.getElementById("profileForm");
const avatarInput = document.getElementById("profileAvatarInput");
const avatarBtn = document.getElementById("profileAvatarBtn");
const avatarPreview = document.getElementById("profileAvatarPreview");
const avatarInitial = document.getElementById("profileAvatarInitial");
const errorBox = document.getElementById("profileError");
const successBox = document.getElementById("profileSuccess");
const saveBtn = document.getElementById("profileSaveBtn");
const bio = document.getElementById("profileBio");
const bioCount = document.getElementById("profileBioCount");

function initials(name){
  const parts = String(name || "P").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0,2).map(x => x[0]).join("").toUpperCase() || "P";
}

function roleLabel(role, globalAdmin){
  if(globalAdmin) return "Tổng quản";
  return ({
    owner: "Chủ QĐ",
    co_owner: "Quyền chủ QĐ",
    veteran: "Kỳ cựu",
    member: "Thành viên"
  })[role] || "Thành viên";
}

function showError(message){
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  successBox.classList.add("hidden");
}

function clearMessages(){
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
}

function paintAvatar(url, name){
  const initial = initials(name);
  avatarInitial.textContent = initial;
  document.getElementById("meAvatarInitial").textContent = initial;

  if(url){
    avatarPreview.style.backgroundImage = `url("${url}")`;
    avatarPreview.classList.add("has-image");
    document.getElementById("meAvatar").style.backgroundImage = `url("${url}")`;
    document.getElementById("meAvatar").classList.add("has-image");
  }else{
    avatarPreview.style.backgroundImage = "";
    avatarPreview.classList.remove("has-image");
    document.getElementById("meAvatar").style.backgroundImage = "";
    document.getElementById("meAvatar").classList.remove("has-image");
  }
}

function fillProfile(){
  document.getElementById("profileDisplayName").value = member.display_name || "";
  document.getElementById("profileIngameName").value = member.ingame_name || member.display_name || "";
  document.getElementById("profileBio").value = member.bio || "";
  document.getElementById("profileUid").textContent = member.freefire_uid || "—";
  document.getElementById("profileBranch").textContent = member.branches?.name || "—";
  document.getElementById("profileRole").textContent = roleLabel(member.role, member.is_global_admin);
  bioCount.textContent = `${(member.bio || "").length} / 160`;
  pendingAvatarUrl = member.avatar_url || null;
  paintAvatar(pendingAvatarUrl, member.display_name);
}

export function initProfile(currentMember){
  member = currentMember;
  fillProfile();

  document.getElementById("me").addEventListener("click", () => {
    clearMessages();
    fillProfile();
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  });

  closeBtn.addEventListener("click", closeProfile);
  avatarBtn.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", uploadAvatar);
  bio.addEventListener("input", () => {
    bioCount.textContent = `${bio.value.length} / 160`;
  });
  form.addEventListener("submit", saveProfile);

  const logoutBtn = document.getElementById("memberLogoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.replace("login.html");
    });
  }

  modal.addEventListener("click", (e) => {
    if(e.target === modal) closeProfile();
  });
}

function closeProfile(){
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  avatarInput.value = "";
  clearMessages();
}

async function uploadAvatar(){
  clearMessages();
  const file = avatarInput.files?.[0];
  if(!file) return;

  const allowed = ["image/jpeg","image/png","image/webp"];
  if(!allowed.includes(file.type)){
    return showError("Avatar chỉ hỗ trợ JPG, PNG hoặc WEBP.");
  }
  if(file.size > 3 * 1024 * 1024){
    return showError("Ảnh avatar phải nhỏ hơn 3MB.");
  }

  avatarBtn.disabled = true;
  avatarBtn.textContent = "Đang tải ảnh...";

  try{
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if(authError || !auth.user) throw new Error("Phiên đăng nhập đã hết hạn.");

    const path = `${auth.user.id}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600"
      });

    if(uploadError) throw uploadError;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    // cache bust vì file path cố định
    pendingAvatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    paintAvatar(pendingAvatarUrl, document.getElementById("profileDisplayName").value);
  }catch(err){
    showError("UPLOAD AVATAR: " + (err.message || "Không thể upload avatar."));
  }finally{
    avatarBtn.disabled = false;
    avatarBtn.textContent = "📷 Đổi ảnh đại diện";
  }
}

async function saveProfile(e){
  e.preventDefault();
  clearMessages();
  saveBtn.disabled = true;
  saveBtn.textContent = "Đang lưu...";

  try{
    const displayName = document.getElementById("profileDisplayName").value.trim();
    const ingameName = document.getElementById("profileIngameName").value.trim();
    const profileBio = bio.value.trim();

    const { data, error } = await supabase.rpc("update_my_profile", {
      new_display_name: displayName,
      new_ingame_name: ingameName,
      new_bio: profileBio,
      new_avatar_url: pendingAvatarUrl
    });

    if(error) throw error;
    if(!data?.ok) throw new Error(data?.message || "Không thể cập nhật hồ sơ.");

    member.display_name = displayName;
    member.ingame_name = ingameName;
    member.bio = profileBio;
    member.avatar_url = pendingAvatarUrl;

    document.getElementById("meName").textContent = displayName;
    paintAvatar(pendingAvatarUrl, displayName);

    successBox.classList.remove("hidden");
  }catch(err){
    showError("LƯU PROFILE: " + (err.message || "Không thể cập nhật hồ sơ."));
  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = "Lưu hồ sơ";
  }
}
