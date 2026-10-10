/* ================== RÉGLAGES THERMAZ ==================
   Tout ce que tu peux modifier sans toucher au reste.            */
const THERMAZ = {
  phone: "06 51 10 64 35",
  phoneLink: "+33651106435",
  email: "thermaz.fr@gmail.com",
  // Clé gratuite sur https://web3forms.com : les demandes arrivent par mail.
  // Vide = le formulaire ouvre l'appli mail du client (moins fiable).
  web3formsKey: "0fdaa1f6-3533-4529-85d1-671b114a7ce0",
  // Ton identifiant de fiche Google (commence par ChIJ...). Sert au bouton "Laisser un avis".
  googlePlaceId: "",
  // Lien vers ta fiche Google (copie l'adresse de ta fiche depuis Google Maps).
  googleProfileUrl: "https://share.google/W5HG0BT9uZtVYETqS"
  // Les avis Google se mettent à jour tout seuls chaque nuit (fichier data/avis-google.json,
  // rempli par le robot GitHub). Aucun chiffre écrit à la main ici.
};
/* ====================================================== */

(function () {
  /* ---- Toujours arriver en haut d'une nouvelle page ----
     (sauf lien vers une section précise, ou retour arrière du navigateur) */
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    const back = nav && nav.type === "back_forward";
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (!back && !target) {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
      window.addEventListener("load", () => window.scrollTo(0, 0));
    }
  } catch {}

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const euro = n => n.toLocaleString("fr-FR").replace(/[  ]/g, " ") + " €";
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  };

  /* ---- Menu mobile + menus déroulants ---- */
  const hdr = $(".hdr");
  $(".burger")?.addEventListener("click", e => {
    const open = hdr.classList.toggle("menu-open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });
  $$(".dd>button").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const dd = b.parentElement, was = dd.classList.contains("open");
    $$(".dd.open").forEach(d => { d.classList.remove("open"); d.firstElementChild.setAttribute("aria-expanded", "false"); });
    if (!was) { dd.classList.add("open"); b.setAttribute("aria-expanded", "true"); }
  }));
  document.addEventListener("click", () => $$(".dd.open").forEach(d => d.classList.remove("open")));
  document.addEventListener("keydown", e => { if (e.key === "Escape") $$(".dd.open").forEach(d => d.classList.remove("open")); });

  /* ---- Photos manquantes : on affiche un fond propre ---- */
  $$("img[data-photo]").forEach(img => {
    const fail = () => img.parentElement.classList.add("noimg");
    img.addEventListener("error", fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });

  /* ---- Lien avis Google ---- */
  $$("[data-review-link]").forEach(a => {
    a.href = THERMAZ.googlePlaceId
      ? "https://search.google.com/local/writereview?placeid=" + THERMAZ.googlePlaceId
      : THERMAZ.googleProfileUrl;
  });
  $$("[data-profile-link]").forEach(a => a.href = THERMAZ.googleProfileUrl);

  /* ---- Avis Google (mis à jour automatiquement) ---- */
  function showRating(rating, count) {
    $$("[data-rating]").forEach(el => {
      el.textContent = rating ? rating.toLocaleString("fr-FR", { minimumFractionDigits: 1 }) + "/5 · " + count + " avis Google" : "Avis Google";
    });
  }
  function showReviews(list) {
    const box = $("#reviews");
    if (!box || !list.length) return;
    box.className = "reviews";
    box.innerHTML = "";
    list.forEach(r => {
      const el = document.createElement("article");
      el.className = "rev";
      el.innerHTML = '<div class="stars"></div><p></p><div class="who"></div>';
      const st = $(".stars", el);
      st.textContent = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
      st.setAttribute("aria-label", r.stars + " étoiles sur 5");
      const txt = r.text.length > 320 ? r.text.slice(0, 300).replace(/\s+\S*$/, "") + "…" : r.text;
      $("p", el).textContent = "« " + txt + " »";
      $(".who", el).innerHTML = "<span></span>";
      $(".who", el).prepend(document.createTextNode(r.name));
      $(".who span", el).textContent = r.when ? " · " + r.when : "";
      box.appendChild(el);
    });
  }
  if ($("[data-rating]") || $("#reviews")) {
    fetch("data/avis-google.json", { cache: "no-cache" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        if (d.url) { THERMAZ.googleProfileUrl = d.url; $$("[data-profile-link]").forEach(a => a.href = d.url); }
        if (d.placeId) $$("[data-review-link]").forEach(a => a.href = "https://search.google.com/local/writereview?placeid=" + d.placeId);
        showRating(d.rating, d.count);
        showReviews((d.reviews || []).filter(r => r.text && !["theo danti"].includes((r.name || "").trim().toLowerCase())));
      })
      .catch(() => {});
  }

  /* ---- Onglets ---- */
  $$("[data-tabs]").forEach(group => {
    const btns = $$('[role="tab"]', group);
    btns.forEach(b => b.addEventListener("click", () => {
      btns.forEach(x => { x.setAttribute("aria-selected", x === b); $("#" + x.getAttribute("aria-controls")).hidden = x !== b; });
    }));
  });

  /* ---- Provenance du visiteur (Google Ads, etc.) ---- */
  const q = new URLSearchParams(location.search);
  ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term"].forEach(k => { if (q.get(k)) store.set("thz_" + k, q.get(k)); });
  if (!store.get("thz_landing")) store.set("thz_landing", location.pathname);
  function attribution() {
    const a = {};
    ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "landing"].forEach(k => { const v = store.get("thz_" + k); if (v) a[k] = v; });
    if (!a.utm_source && a.gclid) a.utm_source = "google-ads";
    return a;
  }

  /* ---- Envoi d'une demande ---- */
  async function sendLead(fields, statusEl) {
    const data = Object.assign({}, fields, attribution());
    const subject = "Demande Thermaz : " + (data.prestation || "devis") + " à " + (data.commune || "?");
    const body = Object.entries(data).filter(([, v]) => v).map(([k, v]) => k + " : " + v).join("\n");
    if (!THERMAZ.web3formsKey) {
      location.href = "mailto:" + THERMAZ.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      statusEl.className = "status";
      statusEl.textContent = "Votre application mail s'ouvre avec la demande prête. Si rien ne s'ouvre, appelez le " + THERMAZ.phone + ".";
      return true;
    }
    statusEl.className = "status"; statusEl.textContent = "Envoi en cours…";
    try {
      const r = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.assign({ access_key: THERMAZ.web3formsKey, subject, from_name: "Site Thermaz" }, data))
      });
      if (!r.ok) throw new Error();
      statusEl.className = "status ok"; statusEl.textContent = "Demande envoyée. Je vous rappelle dans la journée.";
      return true;
    } catch {
      statusEl.className = "status err";
      statusEl.textContent = "L'envoi n'a pas fonctionné. Appelez le " + THERMAZ.phone + ", c'est le plus rapide.";
      return false;
    }
  }

  /* ---- Formulaires simples ---- */
  $$("form[data-lead]").forEach(f => f.addEventListener("submit", async e => {
    e.preventDefault();
    const st = $(".status", f), d = Object.fromEntries(new FormData(f));
    if (!d.nom || !d.telephone || !d.commune) { st.className = "status err"; st.textContent = "Indiquez votre nom, votre téléphone et votre commune pour que je puisse vous rappeler."; return; }
    if (await sendLead(d, st) && THERMAZ.web3formsKey) f.reset();
  }));

  /* ---- Calculateur de prix (page installation) ---- */
  const calc = $("#calc");
  if (calc) {
    const P = JSON.parse(calc.dataset.prices);
    const kw = m2 => m2 <= 25 ? "2.5" : m2 <= 35 ? "3.5" : m2 <= 50 ? "5" : "big";
    const lab = { "2.5": "2,5 kW", "3.5": "3,5 kW", "5": "5 kW" };
    function upd() {
      const rooms = $('input[name=rooms]:checked', calc).value;
      const g = $('input[name=gamme]:checked', calc).value;
      const m2 = +$("#surf").value;
      const gt = g === "pre" ? "gamme premium" : "gamme essentielle";
      $("#surfOut").textContent = m2 + " m²";
      $("#surfBox").hidden = rooms !== "1";
      let what, price, detail;
      if (rooms === "1") {
        const p = kw(m2);
        if (p === "big") { $("#kwHint").textContent = "Au-delà de 50 m² : souvent deux unités ou un gainable."; what = "Grande pièce, " + gt; price = null; detail = "Je vous propose la meilleure solution après visite."; }
        else { $("#kwHint").textContent = "Puissance conseillée : " + lab[p]; what = "Monosplit " + lab[p] + ", " + gt; price = P[g][p]; detail = "Unité murale + groupe extérieur, mise en service comprise."; }
      } else if (rooms === "2") { what = "Bisplit 2 pièces, " + gt; price = P[g].bi; detail = "Un seul groupe extérieur pour deux unités intérieures."; }
      else { what = "3 pièces ou plus, " + gt; price = null; detail = "Trisplit, quadrisplit ou gainable : devis précis sous 24h."; }
      $("#tWhat").textContent = what;
      $("#tPrice").innerHTML = price ? "dès " + euro(price) + "<small> posé</small>" : "Sur devis";
      $("#tDetail").textContent = detail;
      $("#tCta").href = "devis.html#" + (rooms === "1" ? "murale" : "multi");
    }
    $$("input", calc).forEach(i => i.addEventListener("input", upd));
    upd();
  }

  /* ---- Calcul de puissance ---- */
  const pc = $("#pcalc");
  if (pc) {
    const sizes = [2.0, 2.5, 3.5, 4.2, 5.0, 6.0, 7.1];
    function upd() {
      const m2 = +$("#pc-m2").value, h = +$("#pc-h").value;
      const c = +$('input[name=iso]:checked', pc).value;
      let w = m2 * h * c;
      if ($("#pc-sud").checked) w *= 1.1;
      if ($("#pc-top").checked) w *= 1.15;
      const kw = w / 1000;
      const rec = sizes.find(s => s >= kw);
      $("#pc-m2-out").textContent = m2 + " m²";
      $("#pc-res").textContent = kw.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " kW";
      $("#pc-btu").textContent = "soit environ " + Math.round(kw * 3412.14 / 100) * 100 + " BTU/h";
      $("#pc-rec").textContent = rec ? "Modèle conseillé : " + rec.toLocaleString("fr-FR") + " kW" : "Au-delà de 7 kW : plusieurs unités ou un gainable, à voir sur place.";
    }
    $$("input", pc).forEach(i => i.addEventListener("input", upd));
    upd();
  }

  /* ---- Convertisseur BTU / kW ---- */
  const cv = $("#conv");
  if (cv) {
    const btu = $("#cv-btu"), kw = $("#cv-kw"), K = 3412.14;
    const fmt = (n, d) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace(".", ",");
    const num = v => parseFloat(String(v).replace(",", "."));
    btu.addEventListener("input", () => { const v = num(btu.value); kw.value = isNaN(v) ? "" : fmt(v / K, 2); });
    kw.addEventListener("input", () => { const v = num(kw.value); btu.value = isNaN(v) ? "" : fmt(v * K, 0); });
    $$("[data-btu]").forEach(b => b.addEventListener("click", () => { btu.value = b.dataset.btu; btu.dispatchEvent(new Event("input")); }));
  }

  /* ---- Devis en 5 étapes ---- */
  const wiz = $("#wiz");
  if (wiz) {
    const P = JSON.parse(wiz.dataset.prices);
    const steps = $$(".wiz-step", wiz);
    let i = 0;
    const val = n => { const el = $('input[name="' + n + '"]:checked', wiz); return el ? el.value : ""; };
    const labelOf = n => { const el = $('input[name="' + n + '"]:checked', wiz); return el ? el.dataset.label : ""; };
    const preset = location.hash.replace("#", "");
    if (preset) { const el = $('input[value="' + preset + '"]', wiz); if (el) { el.checked = true; if (el.name === "type") { const p = $('input[name=prestation][value=installation]', wiz); if (p) p.checked = true; } } }

    function estimate() {
      if (val("prestation") !== "installation") return null;
      const t = val("type"), rooms = val("pieces"), m2 = +$("#w-m2").value;
      if (t !== "murale" && t !== "multi" && t !== "conseil") return null;
      if (rooms === "1") { const k = m2 <= 25 ? "2.5" : m2 <= 35 ? "3.5" : m2 <= 50 ? "5" : null; return k ? P.ess[k] : null; }
      if (rooms === "2") return P.ess.bi;
      return null;
    }
    function recap() {
      $("#r-presta").textContent = labelOf("prestation") || "À choisir";
      $("#r-type").textContent = labelOf("type") || "–";
      const rooms = labelOf("pieces");
      $("#r-pieces").textContent = rooms ? rooms + " · " + $("#w-m2").value + " m²" : "–";
      $("#r-bien").textContent = [labelOf("bien"), $("#w-commune").value].filter(Boolean).join(" · ") || "–";
      $("#w-m2-out").textContent = $("#w-m2").value + " m²";
      const e = estimate();
      $("#r-est").innerHTML = e ? "dès " + euro(e) : "Sur devis";
    }
    function needsType() { return val("prestation") === "installation"; }
    function show(n) {
      // Les étapes 2 et 3 ne servent qu'à une installation
      if (!needsType() && (n === 1 || n === 2)) n = n > i ? 3 : 0;
      i = n;
      steps.forEach((s, k) => s.hidden = k !== i);
      $("#w-count").textContent = "Étape " + (i + 1) + " / " + steps.length;
      $("#w-name").textContent = steps[i].dataset.name;
      $(".bar i", wiz).style.width = ((i + 1) / steps.length * 100) + "%";
      $("#w-prev").hidden = i === 0;
      $("#w-next").hidden = i === steps.length - 1;
      $("#w-send").hidden = i !== steps.length - 1;
      $("#w-err").textContent = "";
      recap();
    }
    function valid() {
      const s = steps[i], need = s.dataset.require;
      if (need && !val(need)) { $("#w-err").textContent = "Choisissez une réponse pour continuer."; return false; }
      if (i === 3 && !$("#w-commune").value.trim()) { $("#w-err").textContent = "Indiquez votre commune."; return false; }
      return true;
    }
    $("#w-next").addEventListener("click", () => { if (valid()) show(i + 1); });
    $("#w-prev").addEventListener("click", () => show(i - 1));
    $$("input,select", wiz).forEach(el => el.addEventListener("input", recap));
    $$('.opt input[type=radio]', wiz).forEach(el => el.addEventListener("change", () => { if (i < 3) setTimeout(() => { if (valid()) show(i + 1); }, 180); }));
    wiz.addEventListener("submit", async e => {
      e.preventDefault();
      const st = $("#w-status");
      const d = {
        prestation: labelOf("prestation"), type: labelOf("type"), pieces: labelOf("pieces"),
        surface: needsType() ? $("#w-m2").value + " m²" : "", bien: labelOf("bien"),
        commune: $("#w-commune").value, delai: $("#w-delai").value,
        nom: $("#w-nom").value, telephone: $("#w-tel").value, email: $("#w-mail").value,
        source: $("#w-source").value, message: $("#w-msg").value,
        estimation: $("#r-est").textContent
      };
      if (!d.nom || !d.telephone) { st.className = "status err"; st.textContent = "Indiquez votre nom et votre téléphone pour que je puisse vous rappeler."; return; }
      await sendLead(d, st);
    });
    show(0);
  }

  $$("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
})();
