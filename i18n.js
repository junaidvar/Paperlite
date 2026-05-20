/* ============================================================
   PaperLite i18n — translation strings
   ------------------------------------------------------------
   HOW TO ADD A LANGUAGE (the ONLY steps needed):
   1. Copy the entire `en` block below.
   2. Paste it as a new key (e.g. `es`, `fr`, `pt`, `hi`).
   3. Replace every English value with a HUMAN-QUALITY translation.
      Do NOT machine-translate and ship unreviewed — Google
      penalises bulk auto-translated pages and it can suppress
      the whole domain. One real language beats ten hollow ones.
   4. Add the language to LANGS at the bottom (code + native name).
   That is the entire process. No page or code changes required.

   IMPORTANT: a language only "exists" once it has a complete,
   reviewed block here AND localized page content. The scaffold
   never auto-creates thin pages — absent languages simply fall
   back to English, which is safe for SEO.
   ============================================================ */

const I18N = {
  en: {
    _name: "English",
    _dir: "ltr",
    // shared nav / chrome
    nav_fill: "Fill Form",
    nav_merge: "Merge",
    nav_split: "Split",
    nav_img: "Images→PDF",
    nav_unlock: "Remove Password",
    nav_rotate: "Rotate",
    privacy_banner: "🔒 <b>Your file never leaves your device.</b> All processing runs locally in your browser.",
    foot_privacy: "Your files are processed entirely in your browser and never uploaded.",
    foot_terms: "Terms",
    foot_privacy_link: "Privacy",
    foot_disclaimer: "Disclaimer",
    // tool UI strings (used by app.js)
    ui_choose_pdf: "Click to choose a PDF",
    ui_or_drop: "or drop it here",
    ui_add_pdfs: "Click to add PDFs",
    ui_add_images: "Click to add images",
    ui_text_box: "+ Text box",
    ui_check: "+ Checkmark ✓",
    ui_prev: "‹ Prev",
    ui_next: "Next ›",
    ui_download_filled: "Download filled PDF",
    ui_merge_btn: "Merge into one PDF",
    ui_split_range: "Extract this range",
    ui_split_all: "Split every page",
    ui_build_pdf: "Build PDF",
    ui_unlock_btn: "Unlock & download",
    ui_from_page: "From page",
    ui_to_page: "To page",
    ui_pw_known: "The PDF's password",
    ui_done: "Done",
    ui_working: "Working…",
    ui_err_choose: "Choose a file first",
    ui_err_pw: "That password is incorrect for this PDF."
  }

  /* es: { ... },  fr: { ... },  pt: { ... },  hi: { ... }
     Add reviewed blocks here following the rule above. */
};

/* Languages that are LIVE. English only until real translations
   + localized content exist. Adding a code here without a complete
   I18N block above will correctly fall back to English. */
const LANGS = [
  { code: "en", native: "English", dir: "ltr" }
  // { code:"es", native:"Español",  dir:"ltr" },
  // { code:"fr", native:"Français", dir:"ltr" },
  // { code:"pt", native:"Português",dir:"ltr" },
  // { code:"hi", native:"हिन्दी",     dir:"ltr" },
];

/* Resolve current language from URL path: /es/page.html → "es".
   No prefix = English (root). Unknown/incomplete → English. */
function currentLang() {
  const seg = location.pathname.split("/").filter(Boolean)[0] || "";
  if (I18N[seg] && LANGS.some(l => l.code === seg)) return seg;
  return "en";
}
function t(key) {
  const L = currentLang();
  return (I18N[L] && I18N[L][key]) || I18N.en[key] || key;
}

/* Apply translations to any element marked data-i18n / data-i18n-html */
function applyI18n() {
  const L = currentLang();
  document.documentElement.lang = L;
  document.documentElement.dir = (I18N[L] && I18N[L]._dir) || "ltr";
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach(el => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  buildLangSwitcher();
}

/* Language switcher — only renders if more than one live language.
   Switching keeps the user on the same tool, swapping the path prefix. */
function buildLangSwitcher() {
  const host = document.getElementById("langSwitcher");
  if (!host || LANGS.length < 2) return;
  const cur = currentLang();
  const parts = location.pathname.split("/").filter(Boolean);
  const file = parts.length && I18N[parts[0]] ? parts.slice(1).join("/") : parts.join("/");
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", "Language");
  LANGS.forEach(l => {
    const o = document.createElement("option");
    o.value = l.code; o.textContent = l.native;
    if (l.code === cur) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    const code = sel.value;
    const base = (code === "en") ? "/" : "/" + code + "/";
    location.href = base + (file || "index.html");
  };
  host.innerHTML = "";
  host.appendChild(sel);
}

document.addEventListener("DOMContentLoaded", applyI18n);
