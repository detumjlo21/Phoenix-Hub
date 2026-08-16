import { supabase } from "./supabaseClient.js";

const form = document.getElementById("registerForm");
const btn = document.getElementById("registerBtn");
const errorBox = document.getElementById("registerError");
const statusBox = document.getElementById("registerStatus");
const branchSelect = document.getElementById("registerBranch");

function internalEmail(uid){
  return `${String(uid).trim()}@member.phoenix.local`;
}
function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
  statusBox.classList.add("hidden");
}
function showStatus(msg){
  statusBox.textContent = msg;
  statusBox.classList.remove("hidden");
  errorBox.classList.add("hidden");
}

async function loadBranches(){
  const { data, error } = await supabase.from("branches").select("id,name").order("id");
  if(error){
    branchSelect.innerHTML = '<option value="">Không tải được nhánh</option>';
    return;
  }
  branchSelect.innerHTML = '<option value="">Chọn nhánh</option>' +
    (data || []).map(b => `<option value="${b.id}">${b.name}</option>`).join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.add("hidden");
  statusBox.classList.add("hidden");

  const uid = document.getElementById("registerUid").value.trim();
  const ingame = document.getElementById("registerIngame").value.trim();
  const display = document.getElementById("registerDisplay").value.trim();
  const branchId = Number(branchSelect.value);
  const password = document.getElementById("registerPassword").value;
  const password2 = document.getElementById("registerPassword2").value;

  if(!/^[0-9A-Za-z_-]{4,24}$/.test(uid)) return showError("UID game không hợp lệ.");
  if(display.length < 2 || ingame.length < 2) return showError("Tên phải có ít nhất 2 ký tự.");
  if(!branchId) return showError("Hãy chọn nhánh.");
  if(password.length < 6) return showError("Mật khẩu tối thiểu 6 ký tự.");
  if(password !== password2) return showError("Hai mật khẩu không giống nhau.");

  btn.disabled = true;
  btn.textContent = "Đang tạo tài khoản...";

  try{
    // Supabase Auth vẫn dùng email/password, nhưng email này chỉ là định danh nội bộ.
    const { data, error } = await supabase.auth.signUp({
      email: internalEmail(uid),
      password
    });

    if(error) throw error;

    if(!data.session){
      throw new Error(
        "Supabase đang bật Confirm email. Hãy tắt Confirm email trong Authentication → Sign In / Providers → Email."
      );
    }

    const { data: result, error: rpcError } = await supabase.rpc("submit_membership_request_v5", {
      game_uid: uid,
      new_display_name: display,
      new_ingame_name: ingame,
      target_branch_id: branchId
    });

    if(rpcError) throw rpcError;
    if(!result?.ok) throw new Error(result?.message || "Không thể gửi yêu cầu.");

    showStatus("✓ Tạo tài khoản thành công. Yêu cầu đang chờ BQT duyệt.");
    form.classList.add("hidden");

    await supabase.auth.signOut();

    setTimeout(() => {
      location.href = "login.html";
    }, 2500);
  }catch(err){
    const msg = String(err?.message || "");
    if(/already registered|user already registered|duplicate/i.test(msg)){
      showError("UID này đã có tài khoản. Hãy đăng nhập thay vì đăng ký lại.");
    }else{
      showError(msg || "Không thể đăng ký.");
    }
  }finally{
    btn.disabled = false;
    btn.textContent = "Tạo tài khoản & gửi BQT duyệt";
  }
});

loadBranches();
