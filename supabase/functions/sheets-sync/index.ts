import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-sync-secret"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
const norm=(v:string)=>v.trim().toLocaleLowerCase("es").replace(/\s+/g," ");

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.headers.get("x-sync-secret")!==Deno.env.get("SHEETS_SYNC_SECRET"))return json({error:"Unauthorized"},401);
  try{
    const body=await req.json();
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [{data:clientRows},{data:vehicleRows},{data:profiles}]=await Promise.all([
      db.from("clients").select("id,name,ruc"),db.from("vehicles").select("id,name,plate"),db.from("profiles").select("id,full_name,email").eq("active",true)
    ]);
    const clients=new Map((clientRows||[]).map(c=>[norm(c.name),c]));
    const clientsByRuc=new Map((clientRows||[]).filter(c=>c.ruc).map(c=>[String(c.ruc).replace(/\D/g,""),c]));
    const vehicles=new Map<string,any>();(vehicleRows||[]).forEach(v=>{vehicles.set(norm(v.name),v);vehicles.set(norm(v.plate.replaceAll("-","")),v)});
    const people=new Map((profiles||[]).flatMap(p=>[p.full_name,p.email].filter(Boolean).map(v=>[norm(v as string),p.id])));
    const actor=profiles?.[0]?.id;if(!actor)throw new Error("No existe un usuario activo para atribuir registros históricos.");
    async function clientId(name:string,ruc?:string){const key=norm(name),cleanRuc=String(ruc||"").replace(/\D/g,"");if(cleanRuc&&clientsByRuc.has(cleanRuc))return clientsByRuc.get(cleanRuc).id;if(clients.has(key))return clients.get(key).id;const {data,error}=await db.from("clients").insert({name:name.trim(),ruc:cleanRuc||null}).select("id,name,ruc").single();if(error)throw error;clients.set(key,data);if(cleanRuc)clientsByRuc.set(cleanRuc,data);return data.id}
    let serviceCount=0,invoiceCount=0,expenseCount=0;
    for(const row of body.services||[]){
      if(!row.date||!row.client)continue;const cid=await clientId(row.client);const vehicle=vehicles.get(norm(row.plate||row.vehicle||""));
      const kmStart=row.kmStart==null?null:Number(row.kmStart),rawKmEnd=row.kmEnd==null?null:Number(row.kmEnd);
      const kmAnomaly=kmStart!=null&&rawKmEnd!=null&&rawKmEnd<kmStart;
      const kmEnd=kmAnomaly?null:rawKmEnd;
      const notes=[row.notes,row.driver&&`Chofer: ${row.driver}`,row.assistant&&`Auxiliar: ${row.assistant}`,kmAnomaly&&`Hallazgo de importación: KM fin ${rawKmEnd} menor a KM inicio ${kmStart}`].filter(Boolean).join(" | ");
      const {data,error}=await db.from("services").upsert({source_system:"google_sheets",source_key:row.sourceKey,service_date:row.date,client_id:cid,vehicle_id:vehicle?.id||null,merchandise:row.merchandise||null,scheduled_start:row.driverStart||null,scheduled_end:row.driverEnd||null,status:kmEnd!=null?"Completado":row.driverEnd?"Confirmado":"Programado",invoiced:Boolean(row.invoiced),km_start:kmStart,km_end:kmEnd,notes:notes||null,created_by:actor,updated_at:new Date().toISOString()},{onConflict:"source_system,source_key"}).select("id").single();if(error)throw error;serviceCount++;
      for(const [name,role] of [[row.driver,"Chofer"],[row.assistant,"Auxiliar"]]){const uid=name?people.get(norm(name)):null;if(uid)await db.from("service_assignments").upsert({service_id:data.id,user_id:uid,assignment_role:role},{onConflict:"service_id,user_id"})}
      for(const [category,amount] of [["Gasolina",row.gasoline],["GLP",row.glp]])if(Number(amount)>0){const {error:e}=await db.from("expenses").upsert({source_system:"google_sheets",source_key:`${row.sourceKey}:${category}`,expense_date:row.date,category,concept:`${category} · ${row.client}`,amount:Number(amount),vehicle_id:vehicle?.id||null,service_id:data.id,user_id:actor,status:"Aprobado"},{onConflict:"source_system,source_key"});if(e)throw e;expenseCount++}
    }
    for(const row of body.invoices||[]){if(!row.client)continue;const cid=await clientId(row.client,row.ruc);const {error}=await db.from("invoices").upsert({source_system:"google_sheets",source_key:row.sourceKey,invoice_number:row.number||null,issue_date:row.issueDate||null,payment_date:row.paymentDate||null,client_id:cid,amount_without_tax:Number(row.withoutTax)||0,amount_with_tax:Number(row.withTax)||Number(row.withoutTax)||0,withholding_amount:Number(row.withholding)||0,paid_amount:Number(row.paid)||0,status:row.status,concept:row.concept||null,created_by:actor,updated_at:new Date().toISOString()},{onConflict:"source_system,source_key"});if(error)throw error;invoiceCount++}
    for(const row of body.expenses||[]){if(!row.date||Number(row.amount)<=0)continue;const {error}=await db.from("expenses").upsert({source_system:"google_sheets",source_key:row.sourceKey,expense_date:row.date,category:row.category,concept:row.concept,amount:Number(row.amount),user_id:actor,status:"Aprobado"},{onConflict:"source_system,source_key"});if(error)throw error;expenseCount++}
    return json({ok:true,services:serviceCount,invoices:invoiceCount,expenses:expenseCount,syncedAt:new Date().toISOString()});
  }catch(error){
    const detail=error instanceof Error?error.message:typeof error==="object"?JSON.stringify(error):String(error);
    console.error("DCS sheet sync failed",error);
    return json({error:detail},400);
  }
});
