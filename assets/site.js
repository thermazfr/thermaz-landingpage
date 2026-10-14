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

  /* ---- Mesure (Google Tag Manager) : événements pour Google Ads et Analytics ---- */
  window.dataLayer = window.dataLayer || [];
  function track(event, params) { window.dataLayer.push(Object.assign({ event: event }, params || {})); }
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="tel:"]');
    if (a) { const zone = a.closest("header,footer,.callbar,.h-hero,.h-final"); track("phone_click", { emplacement: zone ? zone.className.split(" ")[0] : "page" }); }
    const m = e.target.closest('a[href^="mailto:"]');
    if (m) track("email_click");
  });

  /* ---- Bandeau cookies : rien n'est mesuré sans accord ---- */
  (function consent() {
    let choice = null;
    try { choice = localStorage.getItem("thz_consent"); } catch {}
    const set = v => {
      try { localStorage.setItem("thz_consent", v); } catch {}
      const g = v === "granted" ? "granted" : "denied";
      if (typeof window.gtag === "function") window.gtag("consent", "update", { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g });
      track("consent_" + v);
    };
    window.thermazCookies = () => { const b = document.querySelector(".consent"); if (b) b.hidden = false; else show(); };
    function show() {
      const b = document.createElement("div");
      b.className = "consent"; b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Cookies de mesure");
      b.innerHTML = '<p>J\'utilise des cookies Google pour savoir quelles annonces et quelles pages vous amènent ici, et améliorer le site. Rien n\'est activé sans votre accord. <a href="mentions-legales.html#cookies">En savoir plus</a></p><div class="consent-btns"><button type="button" class="btn btn-line btn-sm" data-c="denied">Refuser</button><button type="button" class="btn btn-ink btn-sm" data-c="granted">Accepter</button></div>';
      b.addEventListener("click", e => { const btn = e.target.closest("[data-c]"); if (!btn) return; set(btn.dataset.c); b.hidden = true; });
      document.body.appendChild(b);
    }
    if (choice !== "granted" && choice !== "denied") show();
  })();

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
  // Le nombre d'avis ne s'affiche qu'à partir de 30 avis ; avant, la note seule.
  const MIN_AVIS_AFFICHES = 30;
  function showRating(rating, count) {
    $$("[data-rating]").forEach(el => {
      if (!rating) { el.textContent = "Avis Google"; return; }
      const note = rating.toLocaleString("fr-FR", { minimumFractionDigits: 1 }) + "/5";
      el.textContent = count >= MIN_AVIS_AFFICHES ? note + " · " + count + " avis Google" : note + " sur Google";
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
      track("generate_lead", { prestation: data.prestation || "", commune: data.commune || "", estimation: data.estimation || "" });
      // Page de remerciement : sert aussi de page de conversion pour Google Ads
      store.set("thz_lead", JSON.stringify({ nom: (data.nom || "").split(" ")[0], telephone: data.telephone || "", prestation: data.prestation || "" }));
      setTimeout(() => { location.href = "merci.html"; }, 1200);
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

  /* ---- Sélecteur de climatiseurs (onglets + carrousel) ---- */
  $$("[data-pds]").forEach(box => {
    const tabs = $$('.pd-tabs [role="tab"]', box);
    function setupPane(pane) {
      if (pane.dataset.ready) return; pane.dataset.ready = 1;
      const track = $(".pd-track", pane), cards = $$(".pd", track), dots = $(".pd-dots", pane);
      cards.forEach((c, i) => { const d = document.createElement("button"); d.type = "button"; d.setAttribute("aria-label", "Modèle " + (i + 1)); d.addEventListener("click", () => track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: "smooth" })); dots.appendChild(d); });
      const upd = () => {
        const i = Math.round(track.scrollLeft / Math.max(1, cards[0].offsetWidth + 18));
        $$("button", dots).forEach((d, k) => d.classList.toggle("on", k === Math.min(i, cards.length - 1)));
        $(".pd-prev", pane).disabled = track.scrollLeft < 8;
        $(".pd-next", pane).disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
        pane.classList.toggle("fits", track.scrollWidth <= track.clientWidth + 4);
      };
      track.addEventListener("scroll", () => requestAnimationFrame(upd), { passive: true });
      window.addEventListener("resize", upd);
      const step = d => track.scrollBy({ left: d * (cards[0].offsetWidth + 18), behavior: "smooth" });
      $(".pd-prev", pane).addEventListener("click", () => step(-1));
      $(".pd-next", pane).addEventListener("click", () => step(1));
      upd();
    }
    tabs.forEach(t => t.addEventListener("click", () => {
      tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); $("#" + x.getAttribute("aria-controls")).hidden = !on; });
      setupPane($("#" + t.getAttribute("aria-controls")));
      t.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }));
    setupPane($(".pd-pane:not([hidden])", box));
  });

  /* ---- Devis rapide de la page d'accueil ---- */
  const qw = $("[data-qw]");
  if (qw) {
    const C = JSON.parse(qw.dataset.qw);
    const el = s => $(s, qw);
    let flow = "installation", i = 0, A = {};
    const steps = () => C.flows[flow].steps;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const lbl = (step, v) => { const o = (step.options || []).find(x => x.v === v); return o ? o.label : v; };

    function estimate() {
      const P = C.prices;
      if (flow === "installation") {
        const g = A.gamme === "pre" ? "pre" : "ess", n = +(A.pieces || 0), m2 = +(A.surface || 25);
        if (A.type === "murale" && n === 1) { const k = m2 <= 25 ? "2.5" : m2 <= 35 ? "3.5" : m2 <= 50 ? "5" : null; return k ? "dès " + euro(P[g][k]) : "Sur devis"; }
        if ((A.type === "multi" || A.type === "murale") && n === 2) return "dès " + euro(P[g].bi);
        return A.type ? "Sur devis" : "";
      }
      if (flow === "entretien") {
        if (A.formule === "contrat") return euro(C.ent.contrat) + "/an";
        if (A.formule === "ponctuel") { const n = +(A.unites || 1); return n > 1 ? "dès " + euro(C.ent.nettoyage) + " / unité" : euro(C.ent.nettoyage); }
        return "";
      }
      return A.panne ? "Diagnostic sur devis" : "";
    }
    function valid(step) {
      if (step.kind === "rooms") return !!A.pieces;
      if (step.kind === "place") return !!A.bien && !!(A.commune || "").trim();
      if (step.kind === "contact") return !!(A.nom || "").trim() && (A.telephone || "").replace(/\D/g, "").length >= 9;
      return !!A[step.key];
    }
    function recap() {
      const st = steps(), done = st.filter(valid).length;
      el(".qw-count").textContent = done + "/" + st.length;
      const e = estimate(); el(".qw-est").textContent = e; el(".qw-est").hidden = !e;
      const rows = [];
      st.forEach(s => {
        if (s.kind === "rooms") { if (A.pieces) rows.push([s.name, A.pieces + (A.pieces === "4" ? "+" : "") + " pièce" + (A.pieces > 1 ? "s" : "") + " · " + (A.surface || 25) + " m²"]); }
        else if (s.kind === "place") { if (A.bien || A.commune) rows.push([s.name, [A.bien && A.bien[0].toUpperCase() + A.bien.slice(1), A.commune].filter(Boolean).join(" · ")]); }
        else if (s.kind === "contact") { if (A.nom) rows.push([s.name, A.nom]); }
        else if (A[s.key]) rows.push([s.name, lbl(s, A[s.key])]);
      });
      el(".qw-list").innerHTML = rows.length ? rows.map(r => "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>").join("") : "<div><dd>Répondez aux questions, votre projet se construit ici.</dd></div>";
    }
    function optCards(step) {
      const items = step.options.map(o => '<button type="button" class="qo' + (A[step.key] === o.v ? " on" : "") + (o.art ? " has-art" : "") + '" data-v="' + esc(o.v) + '">' +
        (o.art ? '<span class="qo-art">' + o.art + "</span>" : '<span class="qo-ic">' + o.icon + "</span>") +
        "<b>" + esc(o.label) + "</b>" + (o.desc ? "<span>" + esc(o.desc) + "</span>" : "") + "</button>").join("");
      return '<div class="qo-track' + (step.options.some(o => o.art) ? " art" : "") + '">' + items + "</div>";
    }
    function render() {
      const st = steps(), s = st[i];
      el(".qw-step").textContent = "Étape " + (i + 1) + " / " + st.length;
      el(".qw-name").textContent = s.name;
      el(".qw-bar i").style.width = ((i + 1) / st.length * 100) + "%";
      el(".qw-title").textContent = s.title;
      el(".qw-status").textContent = ""; el(".qw-status").className = "status qw-status";
      let h = "";
      if (s.options) h = optCards(s);
      else if (s.kind === "chips") h = '<div class="qchips">' + s.chips.map(c => '<button type="button" class="qchip' + (A[s.key] === c ? " on" : "") + '" data-v="' + esc(c) + '">' + esc(c) + "</button>").join("") + "</div>";
      else if (s.kind === "rooms") h = '<div class="qchips big">' + ["1", "2", "3", "4"].map(n => '<button type="button" class="qchip' + (A.pieces === n ? " on" : "") + '" data-room="' + n + '">' + n + (n === "4" ? "+" : "") + " pièce" + (n > 1 ? "s" : "") + "</button>").join("") + '</div><div class="field qw-range"><label for="qw-m2">Surface à climatiser (au total)</label><div class="range"><input type="range" id="qw-m2" min="10" max="150" value="' + (A.surface || 25) + '"><output>' + (A.surface || 25) + " m²</output></div></div>";
      else if (s.kind === "place") h = '<div class="qo-track">' + [["maison", "Maison"], ["appartement", "Appartement"], ["pro", "Local pro"]].map(([v, l]) => '<button type="button" class="qo' + (A.bien === v ? " on" : "") + '" data-bien="' + v + '"><span class="qo-ic">' + C.place_icons[v] + "</span><b>" + l + "</b></button>").join("") + '</div><div class="f2 qw-fields"><div class="field"><label for="qw-commune">Commune</label><input id="qw-commune" data-k="commune" autocomplete="address-level2" placeholder="Salon-de-Provence" value="' + esc(A.commune || "") + '"></div><div class="field"><label for="qw-delai">Quand ?</label><select id="qw-delai" data-k="delai">' + ["Dès que possible", "Dans le mois", "Dans les 3 mois", "Je me renseigne"].map(d => "<option" + (A.delai === d ? " selected" : "") + ">" + d + "</option>").join("") + "</select></div></div>";
      else if (s.kind === "contact") h = '<div class="qw-fields"><div class="f2"><div class="field"><label for="qw-nom">Prénom et nom</label><input id="qw-nom" data-k="nom" autocomplete="name" value="' + esc(A.nom || "") + '"></div><div class="field"><label for="qw-tel">Téléphone</label><input id="qw-tel" data-k="telephone" type="tel" autocomplete="tel" value="' + esc(A.telephone || "") + '"></div></div><div class="field"><label for="qw-mail">E-mail (facultatif)</label><input id="qw-mail" data-k="email" type="email" autocomplete="email" value="' + esc(A.email || "") + '"></div><div class="field"><label for="qw-msg">Précisions (facultatif)</label><textarea id="qw-msg" data-k="message" rows="3" placeholder="Étage, emplacement du groupe extérieur, marque souhaitée…">' + esc(A.message || "") + "</textarea></div></div>";
      el(".qw-content").innerHTML = h;
      el(".qw-prev").hidden = i === 0;
      const last = i === st.length - 1;
      el(".qw-next").textContent = last ? "Envoyer ma demande" : "Suivant";
      el(".qw-next").disabled = !valid(s);
      recap();
    }
    function refresh() { el(".qw-next").disabled = !valid(steps()[i]); recap(); }
    el(".qw-content").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const s = steps()[i];
      if (b.dataset.room) { A.pieces = b.dataset.room; $$(".qchip", qw).forEach(x => x.classList.toggle("on", x === b)); return refresh(); }
      if (b.dataset.bien) { A.bien = b.dataset.bien; $$(".qo", qw).forEach(x => x.classList.toggle("on", x === b)); return refresh(); }
      if (b.dataset.v !== undefined) {
        A[s.key] = b.dataset.v;
        $$(".qo,.qchip", qw).forEach(x => x.classList.toggle("on", x === b));
        refresh();
        setTimeout(() => { if (i < steps().length - 1 && valid(s)) { i++; render(); } }, 260);
      }
    });
    el(".qw-content").addEventListener("input", e => {
      const t = e.target;
      if (t.id === "qw-m2") { A.surface = t.value; t.nextElementSibling.textContent = t.value + " m²"; }
      else if (t.dataset.k) A[t.dataset.k] = t.value;
      refresh();
    });
    el(".qw-content").addEventListener("change", e => { if (e.target.dataset.k) { A[e.target.dataset.k] = e.target.value; refresh(); } });
    el(".qw-prev").addEventListener("click", () => { if (i > 0) { i--; render(); } });
    el(".qw-next").addEventListener("click", async () => {
      const st = steps();
      if (!valid(st[i])) return;
      if (i < st.length - 1) { i++; render(); return; }
      const d = { prestation: C.flows[flow].label };
      st.forEach(s => { if (s.options) d[s.name.toLowerCase()] = lbl(s, A[s.key]); else if (s.kind === "chips") d.marque = A.marque; });
      if (A.pieces) d.pieces = A.pieces + " pièce(s), " + (A.surface || 25) + " m²";
      Object.assign(d, { bien: A.bien, commune: A.commune, delai: A.delai || "Dès que possible", nom: A.nom, telephone: A.telephone, email: A.email || "", message: A.message || "", estimation: estimate() });
      el(".qw-next").disabled = true;
      const ok = await sendLead(d, el(".qw-status"));
      if (ok && THERMAZ.web3formsKey) {
        el(".qw-content").innerHTML = '<div class="qw-done"><b>Merci ' + esc((A.nom || "").split(" ")[0]) + ", votre demande est envoyée.</b><p>Je vous rappelle dans la journée au " + esc(A.telephone) + ".</p></div>";
        el(".qw-nav").hidden = true;
      } else el(".qw-next").disabled = false;
    });
    el(".qw-head").addEventListener("click", e => { const open = el(".qw-list").hidden; el(".qw-list").hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); });
    $$(".qw-tabs button", qw).forEach(b => b.addEventListener("click", () => {
      flow = b.dataset.flow; i = 0; A = {};
      $$(".qw-tabs button", qw).forEach(x => x.setAttribute("aria-selected", x === b));
      el(".qw-nav").hidden = false; render();
    }));
    render();
  }

  /* ---- Page de remerciement personnalisée ---- */
  const thanks = $("[data-thanks]");
  if (thanks) {
    try {
      const L = JSON.parse(store.get("thz_lead") || "{}");
      if (L.nom) $("[data-thanks-name]").textContent = "Merci " + L.nom + ", ";
      if (L.telephone) $("[data-thanks-tel]").textContent = " au " + L.telephone;
      // Conversion Google Ads « request_quote » : une seule fois par demande réellement envoyée
      if (L.telephone && typeof window.gtag === "function") {
        window.gtag("event", "request_quote", { send_to: "AW-18453499766" });
        track("request_quote_sent");
        store.set("thz_lead", "{}");
      }
    } catch {}
  }

  $$("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
})();
