// ---------- Settings ----------
const CACHE_MINUTES = 10;                 // how long saved rates stay fresh
const MAIN_API = (base) => `https://open.er-api.com/v6/latest/${base}`;
const BACKUP_API = (base) => `https://api.frankfurter.dev/v1/latest?base=${base}`;

// ---------- Page elements ----------
const amountEl = document.getElementById("amount");
const fromEl = document.getElementById("from");
const toEl = document.getElementById("to");
const swapEl = document.getElementById("swap");
const resultEl = document.getElementById("result");
const rateEl = document.getElementById("rate");
const updatedEl = document.getElementById("updated");
const statusEl = document.getElementById("status");

// Turns a code like "EUR" into "Euro" (built into the browser).
const names = new Intl.DisplayNames(["en"], { type: "currency" });

// ---------- Getting rates ----------

// Reads saved rates from the browser; returns null if missing or too old.
function readCache(base) {
  try {
    const saved = JSON.parse(localStorage.getItem("rates_" + base));
    if (saved && Date.now() - saved.savedAt < CACHE_MINUTES * 60000) return saved;
  } catch (e) { /* ignore broken or blocked storage */ }
  return null;
}

function writeCache(base, data) {
  try {
    localStorage.setItem("rates_" + base, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch (e) { /* storage full or blocked: app still works */ }
}

// Asks the main API, then the backup. Returns { rates, updated }.
async function fetchRates(base) {
  const cached = readCache(base);
  if (cached) return cached;

  try {
    const res = await fetch(MAIN_API(base));
    const json = await res.json();
    if (json.result !== "success") throw new Error("Main API failed");
    const data = { rates: json.rates, updated: json.time_last_update_unix * 1000 };
    writeCache(base, data);
    return data;
  } catch (mainError) {
    const res = await fetch(BACKUP_API(base)); // throws if offline too
    if (!res.ok) throw new Error("Backup API failed");
    const json = await res.json();
    const data = { rates: { [base]: 1, ...json.rates }, updated: new Date(json.date).getTime() };
    writeCache(base, data);
    return data;
  }
}

// ---------- Converting and showing ----------

// Formats money; Intl picks the right decimals (0 for JPY, 2 for USD...).
function money(value, code) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(value);
  } catch (e) {
    return value.toFixed(2) + " " + code;
  }
}

function showError(message) {
  statusEl.textContent = message;
  resultEl.textContent = "–";
  rateEl.textContent = "";
  updatedEl.textContent = "";
}

async function convert() {
  const amount = parseFloat(amountEl.value);
  const from = fromEl.value;
  const to = toEl.value;
  if (!from || !to) return;

  if (!(amount >= 0)) return showError("Enter a number of 0 or more.");

  statusEl.textContent = "";
  resultEl.textContent = "Loading…";

  try {
    const { rates, updated } = await fetchRates(from);
    const rate = rates[to];
    if (!rate) return showError(`No rate available for ${to}.`);

    resultEl.textContent = money(amount * rate, to);
    rateEl.textContent = `1 ${from} = ${rate.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${to}`;
    updatedEl.textContent = "Last updated: " + new Date(updated).toLocaleString();
  } catch (e) {
    showError("Couldn't load rates. Check your internet connection and try again.");
  }
}

// Waits until typing pauses so we don't convert on every keystroke.
let timer;
function convertSoon() {
  clearTimeout(timer);
  timer = setTimeout(convert, 250);
}

// ---------- Start-up ----------

function fillDropdown(select, codes, selected) {
  select.innerHTML = codes
    .map((c) => `<option value="${c}">${c} – ${names.of(c) || c}</option>`)
    .join("");
  select.value = selected;
}

async function init() {
  try {
    const { rates } = await fetchRates("USD");
    const codes = Object.keys(rates).sort();
    fillDropdown(fromEl, codes, "USD");
    fillDropdown(toEl, codes, codes.includes("EUR") ? "EUR" : codes[0]);
    convert();
  } catch (e) {
    showError("Couldn't load the currency list. Check your connection and reload.");
  }
}

amountEl.addEventListener("input", convertSoon);
fromEl.addEventListener("change", convert);
toEl.addEventListener("change", convert);
swapEl.addEventListener("click", () => {
  [fromEl.value, toEl.value] = [toEl.value, fromEl.value];
  convert();
});

init();
