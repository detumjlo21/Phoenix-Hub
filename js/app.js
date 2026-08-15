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
  const { data: auth } = await supabase.auth.getUser();
  if(!auth.user) return null;

  const { data, error } = await supabase.from("members")
    .select("id,display_name,branch_id,role,is_global_admin,branches(name)")
    .eq("auth_user_id",auth.user.id)
    .maybeSingle();

  if(error) throw error;
  return data;
}

async function getLatestRequest(){
  const { data: auth } = await supabase.auth.getUser();
  if(!auth.user) return null;

  const { data, error } = await supabase.from("membership_requests")
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
  await supabase.from("members")
    .update({is_online:true,last_seen:new Date().toISOString()})
    .eq("id",member.id);
}

async function loadBranches(){
  const cutoff = new Date(Date.now()-2*60*1000).toISOString();

  const [{data:branches,error:bErr},{data:members,error:mErr}] = await Promise.all([
    supabase.from("branches").select("id,name,max_members").order("id"),
    supabase.from("members").select("id,branch_id,last_seen,status")
  ]);
  if(bErr) throw bErr;
  if(mErr) throw mErr;

  let totalOnline=0;
  const box=document.getElementById("branches");
  box.innerHTML="";

  for(const b of branches){
    const branchMembers=members.filter(m=>m.branch_id===b.id && m.status==="active");
    const online=branchMembers.filter(m=>m.last_seen && m.last_seen>=cutoff).length;
    totalOnline+=online;
    const remaining=Math.max(0,b.max_members-branchMembers.length);
    const pct=Math.min(100,(branchMembers.length/b.max_members)*100);

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
  document.getElementById("onlineTotal").textContent=totalOnline;
}

async function init(){
  try{
    await ensureAnonymousSession();
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

      setInterval(async()=>{
        await heartbeat();
        await loadBranches();
      },45000);

      return;
    }

    const req=await getLatestRequest();
    if(!req){
      guestGate.classList.remove("hidden");
    }else if(req.status==="pending"){
      pendingGate.classList.remove("hidden");
    }else if(req.status==="rejected"){
      rejectedGate.classList.remove("hidden");
    }else{
      guestGate.classList.remove("hidden");
    }
  }catch(err){
    console.error(err);
    hideAll();
    guestGate.classList.remove("hidden");
  }
}

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") heartbeat();
});

init();
