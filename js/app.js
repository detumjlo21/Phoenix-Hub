import { supabase } from "./supabaseClient.js";

const gate = document.getElementById("authGate");
const hub = document.getElementById("hub");
const me = document.getElementById("me");
let member = null;
let heartbeat = null;

function showGate(){
  gate.classList.remove("hidden");
  hub.classList.add("hidden");
  me.classList.add("hidden");
}

async function getCurrentMember(){
  const { data: auth } = await supabase.auth.getUser();
  if(!auth.user) return null;

  const { data, error } = await supabase
    .from("members")
    .select("id,display_name,branch_id,branches(name)")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function heartbeatNow(){
  if(!member) return;
  await supabase.from("members")
    .update({ is_online:true, last_seen:new Date().toISOString() })
    .eq("id", member.id);
}

async function loadBranches(){
  const cutoff = new Date(Date.now() - 2*60*1000).toISOString();

  const [{data: branches, error:bErr},{data: members, error:mErr}] = await Promise.all([
    supabase.from("branches").select("id,name,max_members").order("id"),
    supabase.from("members").select("id,branch_id,last_seen,status")
  ]);
  if(bErr) throw bErr;
  if(mErr) throw mErr;

  const box = document.getElementById("branches");
  box.innerHTML = "";
  let totalOnline = 0;

  for(const b of branches){
    const branchMembers = members.filter(m=>m.branch_id===b.id && m.status==="active");
    const online = branchMembers.filter(m=>m.last_seen && m.last_seen >= cutoff).length;
    totalOnline += online;
    const pct = Math.min(100, (branchMembers.length / b.max_members) * 100);
    const remaining = Math.max(0,b.max_members-branchMembers.length);

    box.insertAdjacentHTML("beforeend",`
      <article class="branch-card">
        <div class="branch-head">
          <div><small>${b.name.toUpperCase()}</small><b>${branchMembers.length} / ${b.max_members}</b></div>
          <span class="pill">${remaining===0?"Đầy":`Còn ${remaining} slot`}</span>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="branch-foot">
          <span>${branchMembers.length} thành viên</span>
          <span class="online">🟢 ${online} online</span>
        </div>
      </article>
    `);
  }
  document.getElementById("onlineTotal").textContent = totalOnline;
}

async function init(){
  try{
    member = await getCurrentMember();
    if(!member) return showGate();

    gate.classList.add("hidden");
    hub.classList.remove("hidden");
    me.classList.remove("hidden");
    document.getElementById("meName").textContent = member.display_name;
    document.getElementById("meBranch").textContent = member.branches?.name || "PHOENIX";

    await heartbeatNow();
    await loadBranches();

    heartbeat = setInterval(async ()=>{
      await heartbeatNow();
      await loadBranches();
    }, 45_000);
  }catch(err){
    console.error(err);
    showGate();
  }
}

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible") heartbeatNow();
});

init();
