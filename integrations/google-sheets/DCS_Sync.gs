const SOURCES={
  transport:"1D70tEINHJqtVKTfTtYZ1cF6YVfDvC8WuVSfKP2I7X88",
  invoices:"1fh1b7QU8RHAYf7Y1Wf0Q5_wHk-hKMI5y-I_mtqrpxj8",
  cash:"1OjUHwECw7PqN6MOv8LKlsDuFrJZF5fhx_MQFNIoGyTQ"
};

const SYNC_BLOCK_SIZE=250;
const SYNC_MAX_RUNTIME_MS=240000;
const SYNC_RETRY_LIMIT=4;
const SYNC_FULL_INTERVAL_MS=24*60*60*1000;
const SYNC_SNAPSHOT_PROPERTY="SYNC_SOURCE_SNAPSHOT_V1";
const SYNC_SNAPSHOT_INDEX_PROPERTY="SYNC_SOURCE_SNAPSHOT_INDEX_V1";
const SYNC_SNAPSHOT_SHARD_SIZE=7500;

function syncDcs(){
  const startedAt=Date.now(),lock=LockService.getScriptLock();
  let secret="";
  if(!lock.tryLock(5000)){
    console.log(JSON.stringify({event:"sync_skipped_lock",message:"Ya existe una sincronización en curso."}));
    return;
  }
  try{
    const props=PropertiesService.getScriptProperties();
    const url=props.getProperty("SYNC_URL");secret=props.getProperty("SYNC_SECRET");
    if(!url||!secret)throw new Error("Configura SYNC_URL y SYNC_SECRET en Propiedades del script.");
    const source=readSyncSource(),previous=readSnapshot(props),fullSync=!previous||isFullSyncDue(props);
    const changed={
      services:selectChanged(source.services,previous&&previous.services,fullSync),
      invoices:selectChanged(source.invoices,previous&&previous.invoices,fullSync),
      cash:selectChanged(source.cash,previous&&previous.cash,fullSync),
      cashBalances:selectChanged(source.cashBalances,previous&&previous.cashBalances,fullSync),
      workHours:selectChanged(source.workHours,previous&&previous.workHours,fullSync)
    };
    const lengths=[changed.services.length,changed.invoices.length,changed.cash.length,changed.cashBalances.length,changed.workHours.length];
    const chunkCount=Math.max(1,Math.ceil(Math.max.apply(null,lengths)/SYNC_BLOCK_SIZE)),syncRunId=Utilities.getUuid();
    const sourceKeys={services:keys(source.services),invoices:keys(source.invoices),cash:keys(source.cash),cashBalances:keys(source.cashBalances),workHours:keys(source.workHours)};
    console.log(JSON.stringify({event:"sync_started",syncRunId,mode:fullSync?"full":"incremental",chunkCount,changed:lengths,total:sourceKeys.services.length+sourceKeys.invoices.length+sourceKeys.cash.length+sourceKeys.cashBalances.length+sourceKeys.workHours.length}));
    for(let chunkIndex=0;chunkIndex<chunkCount;chunkIndex++){
      if(Date.now()-startedAt>SYNC_MAX_RUNTIME_MS)throw new Error("La sincronización alcanzó su presupuesto de tiempo; se reintentará en la próxima ejecución.");
      const isFinal=chunkIndex===chunkCount-1,payload={
        syncRunId,chunkIndex,chunkCount,mode:fullSync?"full":"incremental",isFinal,
        services:changed.services.slice(chunkIndex*SYNC_BLOCK_SIZE,(chunkIndex+1)*SYNC_BLOCK_SIZE),
        invoices:changed.invoices.slice(chunkIndex*SYNC_BLOCK_SIZE,(chunkIndex+1)*SYNC_BLOCK_SIZE),
        cash:changed.cash.slice(chunkIndex*SYNC_BLOCK_SIZE,(chunkIndex+1)*SYNC_BLOCK_SIZE),
        cashBalances:changed.cashBalances.slice(chunkIndex*SYNC_BLOCK_SIZE,(chunkIndex+1)*SYNC_BLOCK_SIZE),
        workHours:changed.workHours.slice(chunkIndex*SYNC_BLOCK_SIZE,(chunkIndex+1)*SYNC_BLOCK_SIZE)
      };
      if(isFinal)payload.sourceKeys=sourceKeys;
      const response=postSyncBlock(url,secret,payload,syncRunId,chunkIndex,startedAt);
      if(!response||response.ok!==true)throw new Error("El endpoint no confirmó la aceptación del bloque.");
    }
    writeSnapshot(props,source);
    const now=new Date().toISOString();
    props.setProperty("LAST_SYNC_AT",now);
    if(fullSync)props.setProperty("LAST_FULL_SYNC_AT",now);
    props.setProperty("LAST_SYNC_STATS",JSON.stringify({syncRunId,mode:fullSync?"full":"incremental",chunks:chunkCount,changed:lengths,sourceCounts:[source.services.length,source.invoices.length,source.cash.length,source.cashBalances.length,source.workHours.length],durationMs:Date.now()-startedAt}));
    console.log(JSON.stringify({event:"sync_completed",syncRunId,chunkCount,changed:lengths,durationMs:Date.now()-startedAt}));
  }catch(error){
    console.log(JSON.stringify({event:"sync_failed",durationMs:Date.now()-startedAt,error:safeLog(String(error),secret)}));
    throw error;
  }finally{lock.releaseLock()}
}

function readSyncSource(){
  const cashData=readCashData();
  return{services:readServices(),invoices:readInvoices(),cash:cashData.movements,cashBalances:cashData.balances,workHours:readWorkHours()};
}
function keys(rows){return rows.map(row=>row.sourceKey).filter(Boolean)}
function fingerprint(row){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,JSON.stringify(row),Utilities.Charset.UTF_8))}
function selectChanged(rows,oldFingerprints,forceFull){return rows.filter(row=>forceFull||!oldFingerprints||oldFingerprints[row.sourceKey]!==fingerprint(row))}
function snapshotFor(source){const result={};Object.keys(source).forEach(name=>{result[name]={};source[name].forEach(row=>{result[name][row.sourceKey]=fingerprint(row)})});return result}
function readSnapshot(props){
  const indexRaw=props.getProperty(SYNC_SNAPSHOT_INDEX_PROPERTY),legacyRaw=props.getProperty(SYNC_SNAPSHOT_PROPERTY);
  try{
    if(indexRaw){const index=JSON.parse(indexRaw),snapshot={};Object.keys(index).forEach(name=>{let encoded="";for(let shard=0;shard<index[name];shard++)encoded+=props.getProperty(`${SYNC_SNAPSHOT_INDEX_PROPERTY}_${name}_${shard}`)||"";snapshot[name]=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString())});return snapshot}
    if(legacyRaw)return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(legacyRaw))).getDataAsString());
  }catch(error){console.log(JSON.stringify({event:"snapshot_invalid",error:safeLog(String(error),"")}))}
  return null;
}
function writeSnapshot(props,source){
  const snapshot=snapshotFor(source),oldIndexRaw=props.getProperty(SYNC_SNAPSHOT_INDEX_PROPERTY);let oldIndex={};try{oldIndex=oldIndexRaw?JSON.parse(oldIndexRaw):{}}catch(error){oldIndex={}}
  const index={};
  Object.keys(snapshot).forEach(name=>{for(let shard=0;shard<(oldIndex[name]||0);shard++)props.deleteProperty(`${SYNC_SNAPSHOT_INDEX_PROPERTY}_${name}_${shard}`);const encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(snapshot[name]),"application/json")).getBytes()),count=Math.max(1,Math.ceil(encoded.length/SYNC_SNAPSHOT_SHARD_SIZE));index[name]=count;for(let shard=0;shard<count;shard++)props.setProperty(`${SYNC_SNAPSHOT_INDEX_PROPERTY}_${name}_${shard}`,encoded.slice(shard*SYNC_SNAPSHOT_SHARD_SIZE,(shard+1)*SYNC_SNAPSHOT_SHARD_SIZE))});
  props.setProperty(SYNC_SNAPSHOT_INDEX_PROPERTY,JSON.stringify(index));
  props.deleteProperty(SYNC_SNAPSHOT_PROPERTY);
}
function isFullSyncDue(props){const raw=props.getProperty("LAST_FULL_SYNC_AT"),last=raw?Date.parse(raw):NaN;return !Number.isFinite(last)||Date.now()-last>=SYNC_FULL_INTERVAL_MS}
function postSyncBlock(url,secret,payload,syncRunId,chunkIndex,startedAt){
  let attempt=0;
  while(attempt<SYNC_RETRY_LIMIT){
    attempt++;const requestStarted=Date.now();let code=0,body="";
    try{
      const response=UrlFetchApp.fetch(url,{method:"post",contentType:"application/json",headers:{"x-sync-secret":secret},payload:JSON.stringify(payload),muteHttpExceptions:true});
      code=response.getResponseCode();body=response.getContentText();
      console.log(JSON.stringify({event:"sync_block_response",syncRunId,chunkIndex,attempt,httpCode:code,durationMs:Date.now()-requestStarted,totalDurationMs:Date.now()-startedAt,response:safeLog(body,secret)}));
      if(code>=200&&code<300){try{return JSON.parse(body)}catch(error){throw new Error("Respuesta inválida del endpoint.")}}
      if(!isRetryableCode(code))throw new Error(`HTTP ${code}: ${safeLog(body,secret)}`);
    }catch(error){
      const message=safeLog(String(error),secret);
      console.log(JSON.stringify({event:"sync_block_error",syncRunId,chunkIndex,attempt,httpCode:code,durationMs:Date.now()-requestStarted,totalDurationMs:Date.now()-startedAt,error:message}));
      if(code&&!isRetryableCode(code))throw error;
      if(attempt>=SYNC_RETRY_LIMIT)throw error;
    }
    const delay=Math.min(8000,1000*Math.pow(2,attempt-1)+Math.floor(Math.random()*250));
    if(Date.now()-startedAt+delay>SYNC_MAX_RUNTIME_MS)throw new Error("No queda tiempo seguro para reintentar el bloque.");
    Utilities.sleep(delay);
  }
  throw new Error("No se pudo enviar el bloque después de los reintentos permitidos.");
}
function isRetryableCode(code){return [429,502,503,504].indexOf(code)>=0}
function safeLog(value,secret){const text=String(value||"").replace(secret||"[missing-secret]","[REDACTED]");return text.length>500?text.slice(0,500)+"…":text}

function readServices(){
  const sh=SpreadsheetApp.openById(SOURCES.transport).getSheetByName("Registro Entregas");
  const values=sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),21).getValues();
  return values.map((r,i)=>({sourceKey:`transport:${i+2}`,date:isoDate(r[0]),day:text(r[1]),client:text(r[2]),invoiced:/^si$/i.test(text(r[3])),merchandise:text(r[4]),driver:text(r[5]),driverStart:isoTime(r[6]),driverEnd:isoTime(r[7]),assistant:text(r[9]),vehicle:text(r[13]),plate:text(r[14]),notes:text(r[15]),kmStart:num(r[16]),kmEnd:num(r[17]),gasoline:num(r[19]),glp:num(r[20])})).filter(r=>r.date&&r.client);
}
function readInvoices(){
  const sh=SpreadsheetApp.openById(SOURCES.invoices).getSheetByName("FACTURAS X COBRAR");
  const values=sh.getRange(2,2,Math.max(0,sh.getLastRow()-1),12).getValues();
  return values.map((r,i)=>{const raw=text(r[9]).toUpperCase();return{sourceKey:`invoice:${i+2}`,issueDate:isoDate(r[0]),number:text(r[1]),paymentDate:isoDate(r[10]),client:text(r[3]),ruc:text(r[4]),withoutTax:num(r[5]),withTax:num(r[6]),withholding:num(r[7]),paid:num(r[8]),status:raw.includes("PAGADO")?"Pagado":raw.includes("PARCIAL")?"Parcial":"Pendiente",concept:text(r[11])}}).filter(r=>r.client);
}
function readCashData(){
  const sh=SpreadsheetApp.openById(SOURCES.cash).getSheetByName("EXPRES 2026");
  const values=sh.getRange(5,2,Math.max(0,sh.getLastRow()-4),5).getValues();
  const movements=[],balances=[];
  let lastDate="";
  values.forEach((r,i)=>{
    const row=i+5,concept=text(r[0]),date=isoDate(r[1]);
    if(date)lastDate=date;
    const income=num(r[2]),expense=num(r[3]),balance=num(r[4]);
    const isSummary=/\b(TOTAL|CIERRE|CUADRE)\b/i.test(concept);
    if(isSummary&&balance!=null&&lastDate)balances.push({sourceKey:`cash-balance:${row}`,date:lastDate,label:concept||`Cierre fila ${row}`,balance});
    if(isSummary)return;
    // En la hoja se deja la fecha vacía para repetir la fecha de la fila
    // anterior. Conservamos esa fecha efectiva para no perder el movimiento.
    const base={sourceKey:`cash:${row}`,concept,date:date||lastDate};
    if(income>0)movements.push({...base,sourceKey:`${base.sourceKey}:income`,type:"Ingreso",amount:income});
    if(expense>0)movements.push({...base,sourceKey:`${base.sourceKey}:expense`,type:"Egreso",amount:expense});
  });
  return{movements:movements.filter(r=>r.date&&r.amount>0),balances};
}
function readWorkHours(){
  const sh=SpreadsheetApp.openById(SOURCES.transport).getSheetByName("Resumen");
  const values=sh.getRange(1,1,sh.getLastRow(),15).getDisplayValues(),rows=[];
  values.forEach((r,i)=>{
    [[9,"Lolo"],[12,"Nico"]].forEach(([column,worker])=>{
      const header=text(r[column]),match=header.match(/HORAS\s+SEMANA\s+(\d{1,2})-(\d{1,2})-(\d{2,4})/i);
      if(!match)return;
      let raw="",minutes=null;
      for(let offset=1;offset<=3&&i+offset<values.length;offset++){
        raw=text(values[i+offset][column]);minutes=hourMinutes(raw);if(minutes!=null)break;
      }
      if(minutes==null)return;
      const year=Number(match[3])<100?2000+Number(match[3]):Number(match[3]);
      const weekStart=Utilities.formatString("%04d-%02d-%02d",year,Number(match[2]),Number(match[1]));
      rows.push({sourceKey:`work-hours:${weekStart}:${worker.toLowerCase()}`,weekStart,worker,minutes,sourceValue:raw});
    });
  });
  return rows;
}
function hourMinutes(v){const match=text(v).toLowerCase().match(/^(\d+)\s*h(?:rs?)?\s*(\d+)?/);return match?Number(match[1])*60+Number(match[2]||0):null}
function text(v){return v==null?"":String(v).trim()}
function num(v){
  if(v===""||v==null)return null;
  if(typeof v==="number")return isNaN(v)?null:v;
  let raw=text(v).replace(/[^0-9,.-]/g,"");
  if(!raw)return null;
  const lastComma=raw.lastIndexOf(","),lastDot=raw.lastIndexOf(".");
  if(lastComma>=0&&lastDot>=0){
    if(lastComma>lastDot)raw=raw.replace(/\./g,"").replace(",",".");
    else raw=raw.replace(/,/g,"");
  }else if(lastComma>=0){
    const decimals=raw.length-lastComma-1;
    raw=decimals<=2?raw.replace(",","."):raw.replace(/,/g,"");
  }
  const n=Number(raw);return isNaN(n)?null:n;
}
function isoDate(v){
  if(v instanceof Date&&!isNaN(v))return Utilities.formatDate(v,"America/Lima","yyyy-MM-dd");
  // Usar mediodía UTC evita que America/Lima retroceda un día al convertir
  // números seriales importados desde Excel/Sheets.
  if(typeof v==="number"&&!isNaN(v))return Utilities.formatDate(new Date(Math.round((v-25569)*86400000)+12*60*60*1000),"America/Lima","yyyy-MM-dd");
  const raw=text(v);if(!raw)return "";
  let match=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(match){const year=Number(match[3])<100?2000+Number(match[3]):Number(match[3]);return Utilities.formatString("%04d-%02d-%02d",year,Number(match[2]),Number(match[1]))}
  const parsed=new Date(raw);return isNaN(parsed)?"":Utilities.formatDate(parsed,"America/Lima","yyyy-MM-dd");
}
function isoTime(v){if(!(v instanceof Date)||isNaN(v))return null;return Utilities.formatDate(v,"America/Lima","HH:mm:ss")}
function category(v){const s=v.toLowerCase();if(s.includes("gasolina"))return"Gasolina";if(/\bgas\b|glp/.test(s))return"GLP";if(s.includes("peaje"))return"Peaje";if(s.includes("estacion"))return"Estacionamiento";if(s.includes("manten"))return"Mantenimiento";if(s.includes("pago"))return"Pago personal";if(s.includes("impuesto")||s.includes("sunat"))return"Impuesto";return"Otro"}

function installFiveMinuteTrigger(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="syncDcs").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("syncDcs").timeBased().everyMinutes(5).create();
}
