// CheerpX 1.4.0 recognizes 231 as a read-only WebDevice directory marker.
// Its stat uses GET + Range; the PNG and index.list remain static public files.
// https://cxrtnc.leaningtech.com/1.4.0/cheerpOS.js (ddlOnLoad)
export function GET() {
  return new Response(null, { status: 231 });
}

export function HEAD() {
  return GET();
}
