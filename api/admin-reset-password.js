import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uwtnvfwijofvshlzfzto.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zLqtqHBTAvySajv51eTJ9w_BG9DsapJ";

export default async function handler(req, res){
  if(req.method !== "POST"){
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const bearer = req.headers.authorization || "";
    const accessToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if(!accessToken){
      return res.status(401).json({error:"Missing admin session"});
    }

    const {memberId,newPassword} = req.body || {};
    if(!memberId || !newPassword){
      return res.status(400).json({error:"Missing memberId or newPassword"});
    }
    if(String(newPassword).length < 6 || String(newPassword).length > 72){
      return res.status(400).json({error:"Mật khẩu phải từ 6 đến 72 ký tự."});
    }

    // Client theo session BQT để xác minh quyền.
    const userClient = createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        global:{headers:{Authorization:`Bearer ${accessToken}`}},
        auth:{persistSession:false,autoRefreshToken:false}
      }
    );

    const {data:auth,error:authError} = await userClient.auth.getUser(accessToken);
    if(authError || !auth.user){
      return res.status(401).json({error:"Invalid admin session"});
    }

    const {data:adminContext,error:ctxError} = await userClient.rpc("get_admin_context");
    if(ctxError || !adminContext?.can_access_admin){
      return res.status(403).json({error:"Bạn không có quyền BQT."});
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!serviceKey){
      return res.status(500).json({error:"SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên Vercel."});
    }

    const service = createClient(
      SUPABASE_URL,
      serviceKey,
      {auth:{persistSession:false,autoRefreshToken:false}}
    );

    // Lấy member target + kiểm tra phạm vi quyền.
    const {data:target,error:targetError} = await service
      .from("members")
      .select("id,auth_user_id,branch_id,is_global_admin,role,freefire_uid")
      .eq("id",memberId)
      .maybeSingle();

    if(targetError || !target){
      return res.status(404).json({error:"Không tìm thấy thành viên."});
    }

    if(target.is_global_admin && !adminContext.is_global_admin){
      return res.status(403).json({error:"Chỉ Tổng quản mới được đặt lại mật khẩu tài khoản này."});
    }

    if(!adminContext.is_global_admin && Number(target.branch_id) !== Number(adminContext.branch_id)){
      return res.status(403).json({error:"Bạn chỉ quản lý thành viên thuộc nhánh của mình."});
    }

    if(!target.auth_user_id){
      return res.status(400).json({error:"Thành viên này chưa có tài khoản Auth V5."});
    }

    const {error:updateError} = await service.auth.admin.updateUserById(
      target.auth_user_id,
      {password:newPassword}
    );

    if(updateError){
      return res.status(500).json({error:updateError.message});
    }

    return res.status(200).json({
      ok:true,
      account:target.freefire_uid
    });

  }catch(err){
    console.error("admin-reset-password:",err);
    return res.status(500).json({error:"Reset password failed"});
  }
}
