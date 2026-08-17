import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-sync-secret"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
const norm=(value:unknown)=>String(value??"").trim().toLocaleLowerCase("es").replace(/\s+/g," ");
const keys=(rows:Array<{sourceKey?:string}>)=>rows.map(row=>row.sourceKey).filter((key):key is string=>Boolean(key));
const chunks=<T>(rows:T[],size=200)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(req.headers.get("x-sync-secret")!==Deno.env.get("SHEETS_SYNC_SECRET"))return json({error:"Unauthorized"},401);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let runId:number|null=null;
  try{
    const body=await req.json();
    if(!Array.isArray(body.services)||!Array.isArray(body.invoices)||!Array.isArray(body.cash))throw new Error("El payload debe incluir services, invoices y cash.");
    const run=await db.from("sheet_sync_runs").insert({status:"Ejecutando"}).select("id").single();
    if(run.error)throw run.error;runId=run.data.id;
    const [{data:clientRows},{data:vehicleRows},{data:profiles}]=await Promise.all([
      db.from("clients").select("id,name,ruc"),db.from("vehicles").select("id,name,plate"),db.from("profiles").select("id,full_name,email").eq("active",true)
    ]);
    const clients=new Map((clientRows||[]).map(client=>[norm(client.name),client]));
    const clientsByRuc=new Map((clientRows||[]).filter(client=>client.ruc).map(client=>[String(client.ruc).replace(/\D/g,""),client]));
    const vehicles=new Map<string,any>();(vehicleRows||[]).forEach(vehicle=>{vehicles.set(norm(vehicle.name),vehicle);vehicles.set(norm(String(vehicle.plate).replaceAll("-","")),vehicle)});
    const people=new Map((profiles||[]).flatMap(profile=>[profile.full_name,profile.email].filter(Boolean).map(value=>[norm(value),profile.id])));
    const actor=profiles?.[0]?.id;if(!actor)throw new Error("No existe un usuario activo para atribuir registros históricos.");
    async function clientId(name:string,ruc?:string){const digits=String(ruc||"").replace(/\D/g,"");const cleanRuc=digits.length===11?digits:"";if(cleanRuc&&clientsByRuc.has(cleanRuc))return clientsByRuc.get(cleanRuc).id;const key=norm(name);if(clients.has(key))return clients.get(key).id;const created=await db.from("clients").insert({name:name.trim(),ruc:cleanRuc||null}).select("id,name,ruc").single();if(created.error)throw created.error;clients.set(key,created.data);if(cleanRuc)clientsByRuc.set(cleanRuc,created.data);return created.data.id}
    let serviceCount=0,invoiceCount=0,cashCount=0;
    const serviceInput=new Map(),serviceRows=[];for(const row of body.services){if(!row.sourceKey||!row.date||!row.client)continue;const cid=await clientId(row.client),vehicle=vehicles.get(norm(row.plate||row.vehicle));const kmStart=row.kmStart==null?null:Number(row.kmStart),rawKmEnd=row.kmEnd==null?null:Number(row.kmEnd),kmAnomaly=kmStart!=null&&rawKmEnd!=null&&rawKmEnd<kmStart,kmEnd=kmAnomaly?null:rawKmEnd;const notes=[row.notes,row.driver&&`Chofer: ${row.driver}`,row.assistant&&`Auxiliar: ${row.assistant}`,kmAnomaly&&`Hallazgo de importación: KM fin ${rawKmEnd} menor a KM inicio ${kmStart}`].filter(Boolean).join(" | ");serviceInput.set(row.sourceKey,{row,vehicle});serviceRows.push({source_system:"google_sheets",source_key:row.sourceKey,service_date:row.date,client_id:cid,vehicle_id:vehicle?.id||null,merchandise:row.merchandise||null,scheduled_start:row.driverStart||null,scheduled_end:row.driverEnd||null,status:kmEnd!=null?"Completado":row.driverEnd?"Confirmado":"Programado",invoiced:Boolean(row.invoiced),km_start:kmStart,km_end:kmEnd,notes:notes||null,created_by:actor,updated_at:new Date().toISOString()})}
    const savedServices=[];for(const batch of chunks(serviceRows)){const saved=await db.from("services").upsert(batch,{onConflict:"source_system,source_key"}).select("id,source_key");if(saved.error)throw saved.error;savedServices.push(...(saved.data||[]));serviceCount+=batch.length}
    const assignments=[],fuelExpenses=[];for(const saved of savedServices){const meta=serviceInput.get(saved.source_key),row=meta.row;for(const [name,role] of [[row.driver,"Chofer"],[row.assistant,"Auxiliar"]]){const uid=name?people.get(norm(name)):null;if(uid)assignments.push({service_id:saved.id,user_id:uid,assignment_role:role})}for(const [category,amount] of [["Gasolina",row.gasoline],["GLP",row.glp]])if(Number(amount)>0)fuelExpenses.push({source_system:"google_sheets",source_key:`${row.sourceKey}:${category}`,expense_date:row.date,category,concept:`${category} · ${row.client}`,amount:Number(amount),vehicle_id:meta.vehicle?.id||null,service_id:saved.id,user_id:actor,status:"Aprobado",updated_at:new Date().toISOString()})}
    if(savedServices.length){const cleared=await db.from("service_assignments").delete().in("service_id",savedServices.map(row=>row.id));if(cleared.error)throw cleared.error}
    for(const batch of chunks(assignments)){const assigned=await db.from("service_assignments").upsert(batch,{onConflict:"service_id,user_id"});if(assigned.error)throw assigned.error}
    for(const batch of chunks(fuelExpenses)){const expense=await db.from("expenses").upsert(batch,{onConflict:"source_system,source_key"});if(expense.error)throw expense.error}
    await db.from("invoices").update({invoice_number:null}).eq("source_system","google_sheets");
    const invoiceRows=[];for(const row of body.invoices){if(!row.sourceKey||!row.client)continue;const cid=await clientId(row.client,row.ruc);invoiceRows.push({source_system:"google_sheets",source_key:row.sourceKey,invoice_number:row.number||null,issue_date:row.issueDate||null,payment_date:row.paymentDate||null,client_id:cid,amount_without_tax:Number(row.withoutTax)||0,amount_with_tax:Number(row.withTax)||Number(row.withoutTax)||0,withholding_amount:Number(row.withholding)||0,paid_amount:Number(row.paid)||0,status:row.status||"Pendiente",concept:row.concept||null,created_by:actor,updated_at:new Date().toISOString()})}
    for(const batch of chunks(invoiceRows)){const invoice=await db.from("invoices").upsert(batch,{onConflict:"source_system,source_key"});if(invoice.error)throw invoice.error;invoiceCount+=batch.length}
    const cashRows=body.cash.filter(row=>row.sourceKey&&row.date&&row.type&&Number(row.amount)>0).map(row=>({source_system:"google_sheets",source_key:row.sourceKey,movement_date:row.date,movement_type:row.type,concept:row.concept||"Sin concepto",amount:Number(row.amount),updated_at:new Date().toISOString()}));
    for(const batch of chunks(cashRows)){const movement=await db.from("cash_movements").upsert(batch,{onConflict:"source_system,source_key"});if(movement.error)throw movement.error;cashCount+=batch.length}
    const pruned=await db.rpc("prune_google_sheet_rows",{service_keys:keys(body.services),invoice_keys:keys(body.invoices),cash_keys:keys(body.cash)});if(pruned.error)throw pruned.error;
    await db.from("sheet_sync_runs").update({status:"Correcta",services_count:serviceCount,invoices_count:invoiceCount,cash_count:cashCount,finished_at:new Date().toISOString()}).eq("id",runId);
    return json({ok:true,services:serviceCount,invoices:invoiceCount,cash:cashCount,syncedAt:new Date().toISOString()});
  }catch(error){const detail=error instanceof Error?error.message:JSON.stringify(error);if(runId)await db.from("sheet_sync_runs").update({status:"Error",detail,finished_at:new Date().toISOString()}).eq("id",runId);console.error("DCS sheet sync failed",error);return json({error:detail},400)}
});
