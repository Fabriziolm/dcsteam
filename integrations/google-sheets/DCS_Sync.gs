const SOURCES={
  transport:"1D70tEINHJqtVKTfTtYZ1cF6YVfDvC8WuVSfKP2I7X88",
  invoices:"1fh1b7QU8RHAYf7Y1Wf0Q5_wHk-hKMI5y-I_mtqrpxj8",
  cash:"1OjUHwECw7PqN6MOv8LKlsDuFrJZF5fhx_MQFNIoGyTQ"
};

function syncDcs(){
  const props=PropertiesService.getScriptProperties();
  const url=props.getProperty("SYNC_URL"),secret=props.getProperty("SYNC_SECRET");
  if(!url||!secret)throw new Error("Configura SYNC_URL y SYNC_SECRET en Propiedades del script.");
  const payload={services:readServices(),invoices:readInvoices(),expenses:readExpenses()};
  const response=UrlFetchApp.fetch(url,{method:"post",contentType:"application/json",headers:{"x-sync-secret":secret},payload:JSON.stringify(payload),muteHttpExceptions:true});
  if(response.getResponseCode()>=300)throw new Error(response.getContentText());
  console.log(response.getContentText());
}

function readServices(){
  const sh=SpreadsheetApp.openById(SOURCES.transport).getSheetByName("Registro Entregas");
  const values=sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),21).getValues();
  return values.map((r,i)=>({sourceKey:`transport:${i+2}`,date:isoDate(r[0]),client:text(r[2]),invoiced:/^si$/i.test(text(r[3])),merchandise:text(r[4]),driver:text(r[5]),driverStart:isoTime(r[6]),driverEnd:isoTime(r[7]),assistant:text(r[9]),vehicle:text(r[13]),plate:text(r[14]),notes:text(r[15]),kmStart:num(r[16]),kmEnd:num(r[17]),gasoline:num(r[19]),glp:num(r[20])})).filter(r=>r.date&&r.client);
}
function readInvoices(){
  const sh=SpreadsheetApp.openById(SOURCES.invoices).getSheetByName("FACTURAS X COBRAR");
  const values=sh.getRange(2,2,Math.max(0,sh.getLastRow()-1),12).getValues();
  return values.map((r,i)=>{const raw=text(r[9]).toUpperCase();return{sourceKey:`invoice:${i+2}`,issueDate:isoDate(r[0]),number:text(r[1]),paymentDate:isoDate(r[10]),client:text(r[3]),ruc:text(r[4]),withoutTax:num(r[5]),withTax:num(r[6]),withholding:num(r[7]),paid:num(r[8]),status:raw.includes("PAGADO")?"Pagado":raw.includes("PARCIAL")?"Parcial":"Pendiente",concept:text(r[11])}}).filter(r=>r.client);
}
function readExpenses(){
  const sh=SpreadsheetApp.openById(SOURCES.cash).getSheetByName("EXPRES 2026");
  const values=sh.getRange(5,2,Math.max(0,sh.getLastRow()-4),4).getValues();
  return values.map((r,i)=>({sourceKey:`cash:${i+5}`,concept:text(r[0]),date:isoDate(r[1]),amount:num(r[3]),category:category(text(r[0]))})).filter(r=>r.date&&r.amount>0);
}
function text(v){return v==null?"":String(v).trim()}
function num(v){if(v===""||v==null)return null;const n=Number(String(v).replace(/[^0-9.-]/g,""));return isNaN(n)?null:n}
function isoDate(v){if(!(v instanceof Date)||isNaN(v))return "";return Utilities.formatDate(v,"America/Lima","yyyy-MM-dd")}
function isoTime(v){if(!(v instanceof Date)||isNaN(v))return null;return Utilities.formatDate(v,"America/Lima","HH:mm:ss")}
function category(v){const s=v.toLowerCase();if(s.includes("gasolina"))return"Gasolina";if(/\bgas\b|glp/.test(s))return"GLP";if(s.includes("peaje"))return"Peaje";if(s.includes("estacion"))return"Estacionamiento";if(s.includes("manten"))return"Mantenimiento";if(s.includes("pago"))return"Pago personal";if(s.includes("impuesto")||s.includes("sunat"))return"Impuesto";return"Otro"}

function installHourlyTrigger(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="syncDcs").forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("syncDcs").timeBased().everyHours(1).create();
}
