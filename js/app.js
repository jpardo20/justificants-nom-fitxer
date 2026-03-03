// --- Elements ---
const dateInput   = document.getElementById("dateInput");
const codeInput   = document.getElementById("codeInput");   // ara serà el correu corporatiu
const typeInput   = document.getElementById("typeInput");

const fileInput   = document.getElementById("fileInput");
const dropzone    = document.getElementById("dropzone");

const previewRow  = document.getElementById("previewRow");
const previewImg  = document.getElementById("previewImg");
const fileMeta    = document.getElementById("fileMeta");

const fileNameOut = document.getElementById("fileNameOut");
const nameHint    = document.getElementById("nameHint");

const copyBtn     = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn    = document.getElementById("resetBtn");

const statusBox   = document.getElementById("statusBox");
const codeHelp    = document.getElementById("codeHelp");
const codesBadge  = document.getElementById("codesBadge");

// --- Config ---
const ALLOWED_DOMAIN = "digitechfp.com";
const HASH_LEN = 8; // longitud del "hash curt" (6-8 recomanat)

// --- Estat ---
let selectedFile = null;     // File
let previewUrl   = null;     // string

// --- Utils ---
function pad2(n){ return String(n).padStart(2,"0"); }

function todayAsYYYYMMDD(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function dateToYYYYMMDD(dateStr){
  // input type="date" retorna YYYY-MM-DD
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return dateStr.replaceAll("-", "");
}

function fileExt(file){
  const name = file?.name || "";
  const i = name.lastIndexOf(".");
  if (i === -1) return "";
  return name.slice(i+1).toLowerCase();
}

function setStatus(msg, kind){
  statusBox.textContent = msg || "";
  statusBox.classList.remove("good","warn","bad");
  if (kind) statusBox.classList.add(kind);
}

function setBadge(text){
  codesBadge.textContent = text;
}

// Normalitza correu (minúscules, trim, etc.)
function normalizeEmail(raw){
  return (raw || "").trim().toLowerCase();
}

function isAllowedCorporateEmail(email){
  // validació simple + domini obligatori
  // accepta subdominis? aquí NO (només @digitechfp.com)
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return false;
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

// Base32 “friendly” (sense l, o, etc.) per evitar confusions visuals
const BASE32_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// Converteix bytes a Base32 (variant simple)
function bytesToBase32(bytes){
  let bits = 0;
  let value = 0;
  let output = "";

  for (const b of bytes){
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5){
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0){
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

// Hash curt determinista: SHA-256(email) -> base32 -> primers HASH_LEN caràcters
async function shortHashFromEmail(email){
  const enc = new TextEncoder().encode(email);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  const b32 = bytesToBase32(bytes); // llarg
  return b32.slice(0, HASH_LEN);
}

function normalizeType(raw){
  // tipus per al fitxer: només A-Z0-9_- i en majúscules/minúscules? deixem minúscules
  const t = (raw || "").trim().toLowerCase();
  const safe = t.replace(/[^a-z0-9_-]/g, "");
  return safe || "justificant";
}

// --- Validació ---
async function validateInputsAsync(){
  const ymd = dateToYYYYMMDD(dateInput.value);
  if (!ymd) return { ok:false, reason:"Introdueix una data vàlida." };

  const email = normalizeEmail(codeInput.value);
  if (!email) return { ok:false, reason:"Introdueix el teu correu corporatiu." };

  if (!isAllowedCorporateEmail(email)){
    return { ok:false, reason:`El correu ha d’acabar en @${ALLOWED_DOMAIN}.` };
  }

  if (!selectedFile) return { ok:false, reason:"Puja una imatge per continuar." };

  const ext = fileExt(selectedFile);
  if (!ext) return { ok:false, reason:"El fitxer no té extensió (JPG/PNG/WEBP…)." };

  if (!selectedFile.type.startsWith("image/")){
    return { ok:false, reason:"El fitxer ha de ser una imatge." };
  }

  const hash = await shortHashFromEmail(email);

  return { ok:true, ymd, hash, ext, type: normalizeType(typeInput.value) };
}

// --- Nom del fitxer ---
function buildFileName({ ymd, hash, ext, type }){
  return `${ymd}_${hash}_${type}.${ext}`;
}

async function refreshUI(){
  // Estat general de “validació”
  setBadge(`Domini: @${ALLOWED_DOMAIN}`);
  codesBadge.style.color = "var(--accent)";

  if (!selectedFile){
    fileNameOut.textContent = "—";
    nameHint.textContent = "Puja una imatge per completar el nom.";
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    setStatus("", null);
    return;
  }

  // Mostra nom “preview” si hi ha data+email vàlids
  const ymd = dateToYYYYMMDD(dateInput.value);
  const email = normalizeEmail(codeInput.value);
  const ext = fileExt(selectedFile) || "jpg";
  const type = normalizeType(typeInput.value);

  if (ymd && isAllowedCorporateEmail(email)){
    const hash = await shortHashFromEmail(email);
    fileNameOut.textContent = buildFileName({ ymd, hash, ext, type });
    nameHint.textContent = "Nom generat a partir del teu correu corporatiu (no es guarda ni s’envia).";
  }else{
    fileNameOut.textContent = "—";
    nameHint.textContent = `Completa data i correu @${ALLOWED_DOMAIN} per veure el nom final.`;
  }

  const v = await validateInputsAsync();
  copyBtn.disabled = !v.ok;
  downloadBtn.disabled = !v.ok;

  if (!v.ok){
    setStatus(v.reason, "warn");
    codeHelp.style.color = "var(--muted)";
  }else{
    setStatus("Tot correcte. Pots descarregar el fitxer renombrat.", "good");
    codeHelp.style.color = "var(--muted)";
  }
}

// --- Fitxer: seleccionar / preview ---
function setSelectedFile(file){
  if (!file) return;

  if (previewUrl){
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  selectedFile = file;
  previewUrl = URL.createObjectURL(file);

  previewImg.src = previewUrl;
  previewRow.hidden = false;

  const sizeMB = (file.size / (1024*1024)).toFixed(2);
  fileMeta.textContent = `Seleccionat: ${file.name} · ${sizeMB}MB · ${file.type || "imatge"}`;

  refreshUI();
}

function resetFile(){
  if (previewUrl){
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  selectedFile = null;
  fileInput.value = "";
  previewImg.src = "";
  previewRow.hidden = true;
  fileMeta.textContent = "Formats: JPG / PNG / WEBP · Màx recomanat: 8MB";
  setStatus("", null);
  refreshUI();
}

// --- Accions ---
copyBtn.addEventListener("click", async () => {
  const v = await validateInputsAsync();
  if (!v.ok) return;

  const name = buildFileName(v);
  try{
    await navigator.clipboard.writeText(name);
    setStatus("Nom copiat al porta-retalls.", "good");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = name;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setStatus("Nom copiat (mode compatible).", "good");
  }
});

downloadBtn.addEventListener("click", async () => {
  const v = await validateInputsAsync();
  if (!v.ok) return;

  const newName = buildFileName(v);

  const url = URL.createObjectURL(selectedFile);
  const a = document.createElement("a");
  a.href = url;
  a.download = newName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus(`Descarregat com: ${newName}`, "good");
});

resetBtn.addEventListener("click", resetFile);

// --- Inputs: canvis ---
dateInput.addEventListener("change", refreshUI);

codeInput.addEventListener("input", () => {
  // Normalitza a minúscules mentre escriu (suau)
  const normalized = normalizeEmail(codeInput.value);
  if (codeInput.value !== normalized) codeInput.value = normalized;
  refreshUI();
});

typeInput.addEventListener("change", refreshUI);

// --- Dropzone events ---
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setSelectedFile(file);
});

["dragenter","dragover"].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
});

["dragleave","drop"].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) setSelectedFile(file);
});

// --- Init ---
(function init(){
  dateInput.value = todayAsYYYYMMDD();
  // Informatiu: ja no hi ha codes.json
  setBadge(`Domini: @${ALLOWED_DOMAIN}`);
  refreshUI();
})();