import { initVoice } from "./voice.js";
import { supabase, ensureAnonymousSession } from "./supabaseClient.js";

const guestGate = document.getElementById("guestGate");
const pendingGate = document.getElementById("pendingGate");
const rejectedGate = document.getElementById("rejectedGate");
const hub = document.getElementById("hub");
const me = document.getElementById("me");
const adminLink = document.getElementById("adminLink");

let member = null;

function hideAll(){
  [guestGate,pendingGate,rejectedGate,hub].forEach(el=>el.classList.add("hidden"));
}

async function getCurrentMember(){
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if(authError) throw authError;
  if(!auth.user) return null;

  const { data, error } = await supabase
    .from("members")
    .select("id,display_name,branch_id,role,is_global_admin,branches(name)")
    .eq("auth_user_id",auth.user.id)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function getLatestRequest(){
  const { data: auth } = await supabase.auth.getUser();
  if(!auth.user) return null;

  const { data, error } = await supabase
    .from("membership_requests")
    .select("status,display_name,branch_id,created_at")
    .eq("auth_user_id",auth.user.id)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function heartbeat(){
  if(!member) return;
  const { error } = await supabase
    .from("members")
    .update({is_online:true,last_seen:new Date().toISOString()})
    .eq("id",member.id);
  if(error) console.warn("Heartbeat:", error.message);
}

async function loadBranches(){
  const { data, error } = await supabase.rpc("get_branch_stats");
  if(error) throw error;

  let totalOnline=0;
  const box=document.getElementById("branches");
  box.innerHTML="";

  for(const b of (data || [])){
    const count=Number(b.member_count || 0);
    const online=Number(b.online_count || 0);
    const maxMembers=Number(b.max_members || 55);
    totalOnline+=online;
    const remaining=Math.max(0,maxMembers-count);
    const pct=Math.min(100,(count/maxMembers)*100);

    box.insertAdjacentHTML("beforeend",`
      <article class="branch-card">
        <div class="branch-head">
          <div><small>${String(b.name).toUpperCase()}</small><b>${count} / ${maxMembers}</b></div>
          <span class="pill">${remaining===0?"Đầy":`Còn ${remaining} slot`}</span>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="branch-foot">
          <span>${count} thành viên</span>
          <span class="online">🟢 ${online} online</span>
        </div>
      </article>
    `);
  }
  document.getElementById("onlineTotal").textContent=totalOnline;
}

async function init(){
  try{
    const { data: existing } = await supabase.auth.getSession();
    if(!existing.session) await ensureAnonymousSession();

    hideAll();
    member=await getCurrentMember();

    if(member){
      hub.classList.remove("hidden");
      me.classList.remove("hidden");
      document.getElementById("meName").textContent=member.display_name;
      document.getElementById("meBranch").textContent=member.branches?.name || "PHOENIX";

      if(member.is_global_admin || ["owner","co_owner"].includes(member.role)){
        adminLink.classList.remove("hidden");
      }

      await heartbeat();
      await loadBranches();
      await initVoice(member);
      setInterval(async()=>{await heartbeat();await loadBranches();},45000);
      return;
    }

    const req=await getLatestRequest();
    if(!req) guestGate.classList.remove("hidden");
    else if(req.status==="pending") pendingGate.classList.remove("hidden");
    else if(req.status==="rejected") rejectedGate.classList.remove("hidden");
    else guestGate.classList.remove("hidden");
  }catch(err){
    console.error("PHX Hub init:",err);
    hideAll();
    guestGate.classList.remove("hidden");
  }
}

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") heartbeat();
});

init();
