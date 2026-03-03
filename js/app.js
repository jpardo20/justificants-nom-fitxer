// --- Elements ---
const dateInput   = document.getElementById("dateInput");
const codeInput   = document.getElementById("codeInput");
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

// --- Estat ---
let allowedCodes = null;     // Set<string> o null si no s'ha pogut carregar
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

function normalizeCode(raw){
  // Codi robust: majúscules, sense espais, només A-Z 0-9 _ -
  if (!raw) return "";
  const c = raw.trim().toUpperCase();
  return c.replace(/[^A-Z0-9_-]/g, "");
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

// --- Codis: carregar codes.json ---
async function loadCodes(){
  try{
    const res = await fetch("./codes.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();

    if (!Array.isArray(arr)) throw new Error("JSON no és una llista");
    const set = new Set(arr.map(x => String(x).trim().toUpperCase()).filter(Boolean));
    if (set.size === 0) throw new Error("Llista buida");

    allowedCodes = set;
    setBadge("Validació: activada");
    codesBadge.style.color = "var(--good)";
  }catch(e){
    allowedCodes = null; // sense validació
    setBadge("Validació: desactivada");
    codesBadge.style.color = "var(--warn)";
    // No és un error crític
  }
}

// --- Validació ---
function validateInputs(){
  const ymd = dateToYYYYMMDD(dateInput.value);
  if (!ymd) return { ok:false, reason:"Introdueix una data vàlida." };

  const code = normalizeCode(codeInput.value);
  if (!code) return { ok:false, reason:"Introdueix el teu codi d’alumne." };

  if (allowedCodes && !allowedCodes.has(code)){
    return { ok:false, reason:"Aquest codi no és vàlid. Revisa’l o demana’l a tutoria/coordinació." };
  }

  if (!selectedFile) return { ok:false, reason:"Puja una imatge per continuar." };

  const ext = fileExt(selectedFile);
  if (!ext) return { ok:false, reason:"El fitxer no té extensió (JPG/PNG/WEBP…)." };

  // accept="image/*" ja filtra, però comprovem
  if (!selectedFile.type.startsWith("image/")){
    return { ok:false, reason:"El fitxer ha de ser una imatge." };
  }

  return { ok:true, ymd, code, ext, type: typeInput.value };
}

// --- Nom del fitxer ---
function buildFileName({ ymd, code, ext, type }){
  const safeType = normalizeCode(type) || "justificant";
  return `${ymd}_${code}_${safeType}.${ext}`;
}

function refreshUI(){
  const v = validateInputs();

  if (!selectedFile){
    fileNameOut.textContent = "—";
    nameHint.textContent = "Puja una imatge per completar el nom.";
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    return;
  }

  // Mostra nom parcial encara que falti validació
  const ymd = dateToYYYYMMDD(dateInput.value);
  const code = normalizeCode(codeInput.value);
  const ext = fileExt(selectedFile) || "jpg";
  const type = typeInput.value;

  if (ymd && code){
    fileNameOut.textContent = buildFileName({ ymd, code, ext, type });
    nameHint.textContent = allowedCodes
      ? "Nom generat (validació activa)."
      : "Nom generat (validació desactivada).";
  }else{
    fileNameOut.textContent = "—";
    nameHint.textContent = "Completa data i codi per veure el nom final.";
  }

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

  // Cleanup preview anterior
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
  const v = validateInputs();
  if (!v.ok) return;

  const name = buildFileName(v);
  try{
    await navigator.clipboard.writeText(name);
    setStatus("Nom copiat al porta-retalls.", "good");
  }catch{
    // fallback
    const ta = document.createElement("textarea");
    ta.value = name;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setStatus("Nom copiat (mode compatible).", "good");
  }
});

downloadBtn.addEventListener("click", () => {
  const v = validateInputs();
  if (!v.ok) return;

  const newName = buildFileName(v);

  // Descarrega el mateix fitxer amb nou nom (no re-encode)
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
  // Normalitza mentre escriu (sense ser agressiu)
  const normalized = normalizeCode(codeInput.value);
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
  loadCodes().finally(() => {
    refreshUI();
  });
})();