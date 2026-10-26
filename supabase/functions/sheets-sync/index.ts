import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-sync-secret"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
const norm=(value:unknown)=>String(value??"").trim().toLocaleLowerCase("es").replace(/\s+/g," ");
const chunks=<T>(rows:T[],size=500)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));
const rowKeys=(rows:unknown[])=>rows.map(row=>String((row as {sourceKey?:unknown}).sourceKey??"")).filter(Boolean);
const isCashSummary=(concept:unknown)=>/\b(TOTAL|CIERRE|CUADRE)\b/i.test(String(concept??""));
const sheetDate=(value:unknown)=>{
  const raw=String(value??"").trim(),match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return raw||null;
  const year=Number(match[1]);let month=Number(match[2]),day=Number(match[3]);
  if(month>12&&day<=12)[month,day]=[day,month];
  return `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
};

type SyncBody={
  syncRunId?:string; chunkIndex?:number; chunkCount?:number; mode?:"full"|"incremental"; isFinal?:boolean;
  sourceKeys?:{services?:string[];invoices?:string[];cash?:string[];cashBalances?:string[];workHours?:string[]};
  services:unknown[]; invoices:unknown[]; cash:unknown[]; cashBalances?:unknown[]; workHours?:unknown[];
};

type SourceManifest={
  services:string[];
  invoices:string[];
  cash:string[];
  cashBalances:string[]|null;
  workHours:string[]|null;
};

function safeError(error:unknown){
  if(error instanceof Error)return error.message.slice(0,500);
  if(error&&typeof error==='object'){
    const value=error as Record<string,unknown>;
    const detail=[value.message,value.code,value.details,value.hint].filter(Boolean).join(' | ');
    if(detail)return detail.slice(0,500);
    try{return JSON.stringify(error).slice(0,500)}catch{return 'Error no serializable'}
  }
  return String(error??'Error desconocido').slice(0,500)
}
function isValidIndex(value:unknown){return Number.isInteger(value)&&Number(value)>=0}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(req.headers.get("x-sync-secret")!==Deno.env.get("SHEETS_SYNC_SECRET"))return json({error:"Unauthorized"},401);
  const startedAt=Date.now(),db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let runId:number|null=null;
  try{
    const body=await req.json() as Partial<SyncBody>;
    for(const row of body.services as any[]||[])row.date=sheetDate(row.date);
    for(const row of body.invoices as any[]||[]){row.issueDate=sheetDate(row.issueDate);row.paymentDate=sheetDate(row.paymentDate)}
    for(const row of body.cash as any[]||[])row.date=sheetDate(row.date);
    for(const row of body.cashBalances as any[]||[])row.date=sheetDate(row.date);
    for(const row of body.workHours as any[]||[])row.weekStart=sheetDate(row.weekStart);
    if(!Array.isArray(body.services)||!Array.isArray(body.invoices)||!Array.isArray(body.cash))return json({error:"El payload debe incluir arrays services, invoices y cash."},400);
    const syncRunId=String(body.syncRunId||`legacy-${Date.now()}-${crypto.randomUUID()}`),chunkIndex=body.chunkIndex==null?0:Number(body.chunkIndex),chunkCount=body.chunkCount==null?1:Number(body.chunkCount),isFinal=body.isFinal===true||chunkIndex===chunkCount-1,mode=body.mode==="incremental"?"incremental":"full";
    if(!isValidIndex(chunkIndex)||!isValidIndex(chunkCount)||chunkCount<1||chunkIndex>=chunkCount)return json({error:"Bloque de sincronización inválido."},400);
    const cashBalances=Array.isArray(body.cashBalances)?body.cashBalances:[],workHours=Array.isArray(body.workHours)?body.workHours:[],sourceKeys=isFinal?normalizeManifest(body.sourceKeys,body):null;
    if(isFinal&&!sourceKeys)return json({error:"El bloque final debe incluir el manifiesto completo de sourceKey."},400);
    const run=await getOrCreateRun(db,syncRunId,chunkIndex,chunkCount,mode);if(run.error)throw run.error;runId=run.data.id;
    const [{data:clientRows,error:clientsError},{data:vehicleRows,error:vehiclesError},{data:profiles,error:profilesError}]=await Promise.all([
      db.from("clients").select("id,name,ruc").limit(10000),db.from("vehicles").select("id,name,plate").limit(1000),db.from("profiles").select("id,full_name,email").eq("active",true).limit(1000)
    ]);if(clientsError||vehiclesError||profilesError)throw clientsError||vehiclesError||profilesError;
    const clients=new Map<string,{id:string;name:string;ruc:string|null}>(),clientsByRuc=new Map<string,{id:string;name:string;ruc:string|null}>();
    for(const client of clientRows||[]){const item=client as {id:string;name:string;ruc:string|null};if(!clients.has(norm(item.name)))clients.set(norm(item.name),item);if(item.ruc)clientsByRuc.set(String(item.ruc).replace(/\D/g,""),item)}
    const requestedClients=collectClients(body.services,body.invoices),missingClients=requestedClients.filter(item=>!clients.has(norm(item.name))&&(!item.ruc||!clientsByRuc.has(item.ruc)));
    if(missingClients.length){const created=await db.from("clients").insert(missingClients.map(item=>({name:item.name.trim(),ruc:item.ruc||null}))).select("id,name,ruc");if(created.error)throw created.error;for(const client of created.data||[]){const item=client as {id:string;name:string;ruc:string|null};clients.set(norm(item.name),item);if(item.ruc)clientsByRuc.set(String(item.ruc).replace(/\D/g,""),item)}}
    const clientId=(name:unknown,ruc?:unknown)=>{const digits=String(ruc||"").replace(/\D/g,""),cleanRuc=digits.length===11?digits:"",byRuc=cleanRuc?clientsByRuc.get(cleanRuc):null,byName=clients.get(norm(name));if(byRuc)return byRuc.id;if(byName)return byName.id;throw new Error(`Cliente no disponible: ${String(name||"").slice(0,100)}`)};
    const vehicles=new Map<string,{id:string;name:string;plate:string}>();for(const vehicle of vehicleRows||[]){const item=vehicle as {id:string;name:string;plate:string};vehicles.set(norm(item.name),item);vehicles.set(norm(String(item.plate).replaceAll("-","")),item)}
    const people=new Map<string,string>();for(const profile of profiles||[]){const item=profile as {id:string;full_name:string|null;email:string|null};for(const value of [item.full_name,item.email])if(value)people.set(norm(value),item.id);const name=norm(item.full_name);if(name.includes("nicolas"))people.set("nico",item.id);if(name.includes("luis ortiz"))people.set("lolo",item.id)}
    const actor=(profiles||[])[0]?.id;if(!actor)throw new Error("No existe un usuario activo para atribuir registros históricos.");
    const serviceInput=new Map<string,{row:any;vehicle:{id:string;name:string;plate:string}|undefined}>(),serviceRows:any[]=[];
    for(const row of body.services as any[]){if(!row.sourceKey||!row.date||!row.client)continue;const vehicle=vehicles.get(norm(row.plate||row.vehicle)),kmStart=row.kmStart==null?null:Number(row.kmStart),rawKmEnd=row.kmEnd==null?null:Number(row.kmEnd),kmAnomaly=kmStart!=null&&rawKmEnd!=null&&rawKmEnd<kmStart,kmEnd=kmAnomaly?null:rawKmEnd,notes=[row.notes,row.driver&&`Chofer: ${row.driver}`,row.assistant&&`Auxiliar: ${row.assistant}`,kmAnomaly&&`Hallazgo de importación: KM fin ${rawKmEnd} menor a KM inicio ${kmStart}`].filter(Boolean).join(" | ");serviceInput.set(String(row.sourceKey),{row,vehicle});serviceRows.push({source_system:"google_sheets",source_key:String(row.sourceKey),service_date:row.date,source_day:row.day||null,source_plate:row.plate||null,client_id:clientId(row.client),vehicle_id:vehicle?.id||null,merchandise:row.merchandise||null,scheduled_start:row.driverStart||null,scheduled_end:row.driverEnd||null,status:kmEnd!=null?"Completado":row.driverEnd?"Confirmado":"Programado",invoiced:Boolean(row.invoiced),km_start:kmStart,km_end:kmEnd,notes:notes||null,created_by:actor,updated_at:new Date().toISOString()})}
    const savedServices:any[]=[];for(const batch of chunks(serviceRows)){const saved=await db.from("services").upsert(batch,{onConflict:"source_system,source_key"}).select("id,source_key");if(saved.error)throw saved.error;savedServices.push(...(saved.data||[]))}
    const assignments:any[]=[],assignmentKeys=new Set<string>(),fuelExpenses:any[]=[];
    for(const saved of savedServices){const meta=serviceInput.get(saved.source_key),row=meta?.row;if(!row)continue;for(const [name,role] of [[row.driver,"Chofer"],[row.assistant,"Auxiliar"]] as Array<[unknown,string]>){const uid=name?people.get(norm(name)):null;if(uid&&!assignmentKeys.has(`${saved.id}:${uid}`)){assignmentKeys.add(`${saved.id}:${uid}`);assignments.push({service_id:saved.id,user_id:uid,assignment_role:role})}}for(const [category,amount] of [["Gasolina",row.gasoline],["GLP",row.glp]] as Array<[string,unknown]>){if(Number(amount)>0)fuelExpenses.push({source_system:"google_sheets",source_key:`${row.sourceKey}:${category}`,expense_date:row.date,category,concept:`${category} · ${row.client}`,amount:Number(amount),vehicle_id:meta.vehicle?.id||null,service_id:saved.id,user_id:actor,status:"Aprobado",updated_at:new Date().toISOString()})}}
    const serviceIds=savedServices.map(row=>row.id);if(serviceIds.length){const cleared=await db.from("service_assignments").delete().in("service_id",serviceIds);if(cleared.error)throw cleared.error}
    for(const batch of chunks(assignments)){const assigned=await db.from("service_assignments").upsert(batch,{onConflict:"service_id,user_id"});if(assigned.error)throw assigned.error}
    for(const batch of chunks(fuelExpenses)){const expense=await db.from("expenses").upsert(batch,{onConflict:"source_system,source_key"});if(expense.error)throw expense.error}
    const invoiceRows:any[]=[];for(const row of body.invoices as any[]){if(!row.sourceKey||!row.client)continue;invoiceRows.push({source_system:"google_sheets",source_key:String(row.sourceKey),invoice_number:row.number||null,issue_date:row.issueDate||null,payment_date:row.paymentDate||null,client_id:clientId(row.client,row.ruc),amount_without_tax:Number(row.withoutTax)||0,amount_with_tax:Number(row.withTax)||Number(row.withoutTax)||0,withholding_amount:Number(row.withholding)||0,paid_amount:Number(row.paid)||0,status:row.status||"Pendiente",concept:row.concept||null,created_by:actor,updated_at:new Date().toISOString()})}
    for(const batch of chunks(invoiceRows.filter(row=>row.invoice_number))){
      const currentKeyByNumber=new Map(batch.map(row=>[row.invoice_number,row.source_key]));
      const existing=await db.from("invoices").select("id,invoice_number,source_key").eq("source_system","google_sheets").in("invoice_number",[...currentKeyByNumber.keys()]);
      if(existing.error)throw existing.error;
      const staleIds=(existing.data||[]).filter(row=>currentKeyByNumber.get(row.invoice_number)!==row.source_key).map(row=>row.id);
      if(staleIds.length){const removed=await db.from("invoices").delete().in("id",staleIds);if(removed.error)throw removed.error}
    }
    for(const batch of chunks(invoiceRows)){const invoice=await db.from("invoices").upsert(batch,{onConflict:"source_system,source_key"});if(invoice.error)throw invoice.error}
    const cashRows=(body.cash as any[]).filter(row=>row.sourceKey&&row.date&&row.type&&Number(row.amount)>0&&!isCashSummary(row.concept)).map(row=>({source_system:"google_sheets",source_key:String(row.sourceKey),movement_date:row.date,movement_type:row.type,concept:row.concept||"Sin concepto",amount:Number(row.amount),updated_at:new Date().toISOString()}));
    for(const batch of chunks(cashRows)){const movement=await db.from("cash_movements").upsert(batch,{onConflict:"source_system,source_key"});if(movement.error)throw movement.error}
    const balanceRows=cashBalances.filter((row:any)=>row.sourceKey&&row.date&&Number.isFinite(Number(row.balance))).map((row:any)=>({source_system:"google_sheets",source_key:String(row.sourceKey),balance_date:row.date,label:row.label||"Cierre de caja",balance:Number(row.balance),updated_at:new Date().toISOString()}));
    for(const batch of chunks(balanceRows)){const balance=await db.from("cash_balance_snapshots").upsert(batch,{onConflict:"source_system,source_key"});if(balance.error)throw balance.error}
    const workHourRows=workHours.filter((row:any)=>row.sourceKey&&row.weekStart&&row.worker&&Number.isInteger(Number(row.minutes))&&Number(row.minutes)>=0).map((row:any)=>({source_system:"google_sheets",source_key:String(row.sourceKey),user_id:people.get(norm(row.worker))||null,worker_label:String(row.worker).trim(),week_start:row.weekStart,worked_minutes:Number(row.minutes),source_value:row.sourceValue||null,updated_at:new Date().toISOString()}));
    for(const batch of chunks(workHourRows)){const hours=await db.from("imported_work_hours").upsert(batch,{onConflict:"source_system,source_key"});if(hours.error)throw hours.error}
    if(isFinal){const pruned=await db.rpc("prune_google_sheet_rows",{service_keys:sourceKeys!.services,invoice_keys:sourceKeys!.invoices,cash_keys:sourceKeys!.cash,cash_balance_keys:sourceKeys!.cashBalances,work_hour_keys:sourceKeys!.workHours});if(pruned.error)throw pruned.error}
    const recordsReceived=serviceRows.length+invoiceRows.length+cashRows.length+balanceRows.length+workHourRows.length,update=await db.from("sheet_sync_runs").update({status:isFinal?"Correcta":"Ejecutando",services_count:serviceRows.length,invoices_count:invoiceRows.length,cash_count:cashRows.length,records_received:recordsReceived,duration_ms:Date.now()-startedAt,finished_at:isFinal?new Date().toISOString():null}).eq("id",runId);if(update.error)throw update.error;
    return json({ok:true,accepted:true,syncRunId,chunkIndex,chunkCount,isFinal,services:serviceRows.length,invoices:invoiceRows.length,cash:cashRows.length,recordsReceived,durationMs:Date.now()-startedAt});
  }catch(error){const detail=safeError(error);if(runId)await db.from("sheet_sync_runs").update({status:"Error",detail,duration_ms:Date.now()-startedAt,finished_at:new Date().toISOString()}).eq("id",runId);console.error("DCS sheet sync failed",detail);return json({ok:false,accepted:false,error:detail},503)}
});

function collectClients(services:unknown[],invoices:unknown[]){const result=new Map<string,{name:string;ruc:string}>();for(const row of [...services,...invoices] as any[]){const name=String(row.client||"").trim();if(!name)continue;const ruc=String(row.ruc||"").replace(/\D/g,"");const key=ruc||norm(name);if(!result.has(key))result.set(key,{name,ruc:ruc.length===11?ruc:""})}return [...result.values()]}
function normalizeManifest(manifest:SyncBody["sourceKeys"]|undefined,body:Partial<SyncBody>):SourceManifest|null{
  if(manifest){
    if(!Array.isArray(manifest.services)||!Array.isArray(manifest.invoices)||!Array.isArray(manifest.cash)||!Array.isArray(manifest.cashBalances)||!Array.isArray(manifest.workHours))return null;
    return{services:manifest.services,invoices:manifest.invoices,cash:manifest.cash,cashBalances:manifest.cashBalances,workHours:manifest.workHours};
  }
  if(body.syncRunId)return null;
  return{
    services:rowKeys(body.services||[]),
    invoices:rowKeys(body.invoices||[]),
    cash:rowKeys(body.cash||[]),
    // Un cliente legado puede no conocer estas colecciones. null hace que
    // PostgreSQL omita su poda en lugar de interpretar la ausencia como vacía.
    cashBalances:Array.isArray(body.cashBalances)?rowKeys(body.cashBalances):null,
    workHours:Array.isArray(body.workHours)?rowKeys(body.workHours):null
  };
}
async function getOrCreateRun(db:any,syncRunId:string,chunkIndex:number,chunkCount:number,mode:string){const existing=await db.from("sheet_sync_runs").select("id").eq("sync_run_key",syncRunId).eq("chunk_index",chunkIndex).maybeSingle();if(existing.error)return existing;if(existing.data)return existing;return db.from("sheet_sync_runs").insert({status:"Ejecutando",sync_run_key:syncRunId,chunk_index:chunkIndex,chunk_count:chunkCount,sync_mode:mode}).select("id").single()}
