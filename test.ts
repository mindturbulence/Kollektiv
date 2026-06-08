import fetch from 'node-fetch';
async function test() {
  console.log("Fetching...");
  const res = await fetch("http://localhost:3000/google-api/drive/v3/files");
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Text:", text.substring(0, 100));
}
test().catch(console.error);
