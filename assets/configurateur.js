/* Configurateur de prix Thermaz
   Une seule page, tout visible (comme une fiche produit) : un modèle est proposé d'office,
   le prix TTC posé s'affiche tout de suite et change à chaque choix.
   Les coordonnées ne sont demandées qu'après « Recevoir mon devis ».
   Prix : data/catalogue.json (grille Thermaz, liaison de base comprise). */
(function () {
  const root = document.getElementById("cfg");
  if (!root) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const euro = n => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " €";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const kwMax = s => Math.max(...String(s).split("+").map(x => parseFloat(x.replace(",", "."))));
  const kwTxt = s => /kW/.test(s) ? String(s).replace(/\s*\+\s*/g, " + ") : String(s) + " kW";

  /* ---- Réglages ---- */
  const CONTRAT = 149;           // € par an et par unité intérieure
  const ENTRETIEN_OFFERT = new Date() <= new Date("2026-11-15T23:59:59");
  // Supplément de liaison frigorifique (la longueur de base est comprise dans le prix)
  const LIAISON = {
    std: [{ v: 0, l: "Jusqu'à 5 m", s: "Inclus" }, { v: 200, l: "5 à 10 m", s: "+200 €" }, { v: 400, l: "Plus de 10 m", s: "+400 €" }],
    gainable: [{ v: 0, l: "Jusqu'à 4 m", s: "Inclus" }, { v: 200, l: "4 à 10 m", s: "+200 €" }, { v: 400, l: "Plus de 10 m", s: "+400 €" }]
  };
  const TYPES = {
    murale: { l: "Murale", t: "mural" },
    multi: { l: "Plusieurs pièces", t: "mural" },
    console: { l: "Console", t: "console" },
    gainable: { l: "Gainable", t: "gainable" },
    monobloc: { l: "Monobloc", t: "monobloc" }
  };

  /* ---- Visuels catalogue (dessins neutres, en attendant les photos fabricants) ---- */
  const U = (x, y, w) => {                 // unité murale vue de face
    const h = w * 0.27;
    return '<g transform="translate(' + x + " " + y + ')"><rect width="' + w + '" height="' + h + '" rx="' + h * 0.28 + '" fill="url(#cg)" stroke="#D5DCE3"/>' +
      '<rect x="' + w * 0.06 + '" y="' + h * 0.72 + '" width="' + w * 0.88 + '" height="' + h * 0.1 + '" rx="' + h * 0.05 + '" fill="#9AA7B4"/>' +
      '<circle cx="' + w * 0.9 + '" cy="' + h * 0.36 + '" r="' + Math.max(2, w * 0.012) + '" fill="#2E8BFF"/></g>';
  };
  const OUT = (x, y, w) => {               // groupe extérieur
    const h = w * 0.72, r = h * 0.36;
    return '<g transform="translate(' + x + " " + y + ')"><rect width="' + w + '" height="' + h + '" rx="6" fill="url(#cg)" stroke="#D5DCE3"/>' +
      '<circle cx="' + w * 0.38 + '" cy="' + h / 2 + '" r="' + r + '" fill="#E9EDF1" stroke="#B9C3CD"/>' +
      [0.75, 0.5, 0.25].map(k => '<circle cx="' + w * 0.38 + '" cy="' + h / 2 + '" r="' + r * k + '" fill="none" stroke="#C7D0D8"/>').join("") +
      '<rect x="' + w * 0.78 + '" y="' + h * 0.2 + '" width="' + w * 0.12 + '" height="' + h * 0.6 + '" rx="3" fill="#E1E6EB"/></g>';
  };
  const DEFS = '<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E8EDF2"/></linearGradient></defs>';
  function visuel(type, n) {
    let g = "";
    if (type === "murale") g = U(30, 70, 260);
    if (type === "multi") {
      const w = n > 2 ? 78 : 112, gap = n > 2 ? 14 : 22, tot = n * w + (n - 1) * gap;
      for (let i = 0; i < n; i++) g += U((320 - tot) / 2 + i * (w + gap), 58, w);
      g += OUT(122, 124, 76);
    }
    if (type === "console") g = '<g transform="translate(105 28)"><rect width="110" height="150" rx="12" fill="url(#cg)" stroke="#D5DCE3"/>' +
      [16, 24, 32].map(y => '<rect x="16" y="' + y + '" width="78" height="3" rx="1.5" fill="#B9C3CD"/>').join("") +
      [118, 126, 134].map(y => '<rect x="16" y="' + y + '" width="78" height="3" rx="1.5" fill="#B9C3CD"/>').join("") +
      '<circle cx="92" cy="52" r="2.5" fill="#2E8BFF"/></g>';
    if (type === "gainable") g = '<rect x="0" y="40" width="320" height="6" fill="#DCE2E8"/>' +
      [70, 190].map(x => '<g transform="translate(' + x + ' 46)"><rect width="60" height="16" rx="3" fill="url(#cg)" stroke="#D5DCE3"/>' +
        [4, 8, 12].map(y => '<rect x="6" y="' + y + '" width="48" height="1.6" fill="#B9C3CD"/>').join("") + "</g>").join("") +
      '<path d="M100 86 q0 30 0 50 M220 86 q0 30 0 50" stroke="#CFE2FA" stroke-width="10" stroke-linecap="round" fill="none" opacity=".7"/>';
    if (type === "monobloc") g = '<g transform="translate(40 60)"><rect width="240" height="80" rx="14" fill="url(#cg)" stroke="#D5DCE3"/>' +
      '<rect x="18" y="56" width="204" height="8" rx="4" fill="#9AA7B4"/><circle cx="216" cy="22" r="3" fill="#2E8BFF"/>' +
      '<rect x="18" y="18" width="70" height="6" rx="3" fill="#E1E6EB"/></g>';
    return '<svg viewBox="0 0 320 200" role="img" aria-label="Climatisation ' + esc(TYPES[type].l.toLowerCase()) + '">' + DEFS + g + "</svg>";
  }

  /* ---- État ---- */
  const S = { type: "murale", m2: 25, rooms: [25], gamme: "ess", line: "", showAll: false, model: null, manual: false, liaison: 0, contrat: false,
              nom: "", tel: "", mail: "", commune: "", delai: "Dès que possible", msg: "" };
  let CAT = [];

  /* ---- Calculs ---- */
  const multi = () => S.type === "multi";
  function besoin() {                       // puissance conseillée en kW (≈ 100 W/m², à confirmer à la visite)
    if (multi()) return Math.max(...S.rooms) / 10;
    if (S.type === "gainable") return S.rooms.reduce((a, b) => a + b, 0) / 10;
    return S.m2 / 10;
  }
  function pool(gamme) {
    const T = TYPES[S.type], u = multi() ? S.rooms.length : 1;
    return CAT.filter(m => m.t === T.t && m.u === u && m.pre === (gamme === "pre"));
  }
  function conseille(models) {             // le plus petit qui couvre le besoin (multi : le moins cher qui couvre la plus grande pièce)
    const need = besoin();
    const ok = models.filter(m => kwMax(m.kw) + 0.25 >= need);
    if (!ok.length) return models.slice().sort((a, b) => kwMax(b.kw) - kwMax(a.kw))[0];
    return ok.sort((a, b) => multi() ? a.p - b.p : kwMax(a.kw) - kwMax(b.kw) || a.p - b.p)[0];
  }
  function lignes(gamme) {
    const by = {};
    pool(gamme).forEach(m => { (by[m.b + "|" + m.g] = by[m.b + "|" + m.g] || []).push(m); });
    return Object.entries(by).map(([k, ms]) => {
      ms.sort((a, b) => kwMax(a.kw) - kwMax(b.kw) || a.p - b.p);
      const rec = conseille(ms);
      return { k, b: ms[0].b, g: ms[0].g, models: ms, rec, p: rec.p };
    }).sort((a, b) => a.p - b.p);
  }
  function units() { return S.model ? S.model.u : 1; }
  function liaisons() { return S.type === "gainable" ? LIAISON.gainable : LIAISON.std; }
  function total() { return S.model ? S.model.p + (multi() || S.type === "monobloc" ? 0 : S.liaison) : null; }

  // Recalcule la sélection : gamme disponible, modèle, puissance conseillée
  function resoudre() {
    if (!pool(S.gamme).length) S.gamme = S.gamme === "pre" ? "ess" : "pre";
    const L = lignes(S.gamme);
    if (!L.length) { S.model = null; return L; }
    let line = L.find(l => l.k === S.line);
    if (!line) { line = L[0]; S.line = line.k; S.manual = false; }
    if (!S.manual || !line.models.includes(S.model)) { S.model = line.rec; S.manual = false; }
    return L;
  }

  /* ---- Affichage ---- */
  const chip = (name, val, on, label, sub, extra) =>
    '<label class="cf-chip' + (extra || "") + '"><input type="radio" name="' + name + '" value="' + esc(val) + '"' + (on ? " checked" : "") + "><span>" + label + (sub ? "<small>" + sub + "</small>" : "") + "</span></label>";
  const stepper = (i, v, lab) =>
    '<div class="cf-room"><span>' + lab + '</span><div class="cf-step"><button type="button" data-room="' + i + '" data-d="-1" aria-label="Moins de surface, ' + lab + '">−</button>' +
    "<output>" + v + ' <small>m²</small></output><button type="button" data-room="' + i + '" data-d="1" aria-label="Plus de surface, ' + lab + '">+</button></div></div>';

  function render() {
    const L = resoudre(), m = S.model, t = total();
    // Visuel et en-tête produit
    $("#c-visual").innerHTML = visuel(S.type, multi() ? S.rooms.length : 1);
    $("#c-badges").innerHTML = '<span class="cf-badge">' + esc(TYPES[S.type].l) + '</span><span class="cf-badge cf-badge-g">' + (S.gamme === "pre" ? "Premium" : "Essentielle") + "</span>";
    $("#c-brand").textContent = m ? m.b : "";
    $("#c-name").textContent = m ? m.g + " · " + kwTxt(m.kw) : "Choisissez votre clim";
    $$(".c-total").forEach(b => b.textContent = t ? euro(t) : "–");
    const surf = multi() || S.type === "gainable" ? S.rooms.reduce((a, b) => a + b, 0) : S.m2;
    $("#c-facts").innerHTML =
      "<div><dt>Surface</dt><dd>" + surf + " m²</dd></div>" +
      "<div><dt>Puissance</dt><dd>" + (m ? kwTxt(m.kw) : "–") + "</dd></div>" +
      "<div><dt>Unités</dt><dd>" + (m ? m.u + (m.u > 1 ? " intérieures" : " intérieure") : "–") + "</dd></div>" +
      "<div><dt>Pose</dt><dd>Par l'artisan</dd></div>";

    // Type
    $("#c-type").innerHTML = Object.entries(TYPES).map(([k, T]) => chip("c-type", k, S.type === k, T.l)).join("");

    // Surface / pièces
    let h = "";
    if (multi() || S.type === "gainable") {
      const nums = multi() ? [2, 3, 4] : [2, 3, 4, 5, 6];
      h += '<p class="cf-sub">' + (multi() ? "Nombre de pièces" : "Nombre de pièces desservies") + '</p><div class="cf-chips">' +
        nums.map(n => chip("c-nb", n, S.rooms.length === n, n + " pièces")).join("") + "</div>";
      h += '<div class="cf-rooms">' + S.rooms.map((v, i) => stepper(i, v, "Pièce " + (i + 1))).join("") + "</div>";
    } else {
      h += '<div class="cf-rooms cf-rooms-1">' + stepper(-1, S.m2, "Surface de la pièce") + "</div>";
    }
    $("#c-surface").innerHTML = h;

    // Gamme
    $("#c-gamme").innerHTML = [["ess", "Essentielle", "Fiable, petit prix"], ["pre", "Premium", "Daikin, Mitsubishi Electric"]]
      .filter(([g]) => pool(g).length).map(([g, l, s]) => chip("c-gamme", g, S.gamme === g, l, s)).join("");

    // Modèle (marque comprise) : les 5 meilleurs prix, les autres sur demande
    const TOP = 5;
    const vis = S.showAll ? L : L.filter((l, i) => i < TOP || l.k === S.line);
    $("#c-model").innerHTML = vis.map(l =>
      chip("c-line", l.k, S.line === l.k, esc(l.b) + " <em>" + esc(l.g) + "</em>", euro(l.p))).join("") +
      (L.length > vis.length ? '<button type="button" class="cf-more" data-more>Voir toutes les marques (+' + (L.length - vis.length) + ")</button>" : "");

    // Puissance
    const line = L.find(l => l.k === S.line);
    $("#c-power").innerHTML = line ? line.models.map((x, i) =>
      chip("c-power", i, x === m, esc(kwTxt(x.kw)), x === line.rec ? "conseillée" : "", x === line.rec ? " cf-rec" : "")).join("") : "";
    $("#c-power-hint").textContent = "Conseillée pour " + (multi() ? "votre plus grande pièce (" + Math.max(...S.rooms) + " m²)" : surf + " m²") + ", à environ 100 W par m². Je la vérifie sur place.";

    // Liaison
    if (multi() || S.type === "monobloc") {
      S.liaison = 0;
      $("#c-liaison").innerHTML = '<span class="cf-chip cf-static"><span>✓ ' + (multi() ? "Incluses, pose standard" : "Sans liaison : pas de groupe extérieur") + "</span></span>";
    } else {
      if (!liaisons().some(o => o.v === S.liaison)) S.liaison = 0;
      $("#c-liaison").innerHTML = liaisons().map(o => chip("c-liaison", o.v, S.liaison === o.v, o.l, o.s)).join("");
    }

    // Contrat
    const n = units();
    $("#c-contrat").innerHTML = chip("c-contrat", "0", !S.contrat, "Sans") +
      chip("c-contrat", "1", S.contrat, "Contrat annuel", CONTRAT * n + " €/an" + (n > 1 ? " (" + n + " unités)" : ""));
    $("#c-contrat-line").textContent = S.contrat ? "+ contrat d'entretien " + CONTRAT * n + " €/an" : "";
    // SMS prérempli pour envoyer ses photos
    $("#c-sms").href = "sms:+33651106435?&body=" + encodeURIComponent("Bonjour, voici les photos de mon projet de clim (" +
      (m ? m.b + " " + m.g + " " + kwTxt(m.kw) + ", " + euro(t) : TYPES[S.type].l) + ", " + surf + " m²) :");
    $("#c-offer").hidden = !ENTRETIEN_OFFERT;
  }

  /* ---- Événements ---- */
  root.addEventListener("change", e => {
    const t = e.target, v = t.value;
    if (t.name === "c-type") {
      S.type = v; S.manual = false; S.line = ""; S.showAll = false;
      S.rooms = v === "multi" ? [18, 12] : v === "gainable" ? [18, 17] : [S.m2];
    }
    if (t.name === "c-nb") { const k = +v; while (S.rooms.length < k) S.rooms.push(12); S.rooms.length = k; S.manual = false; S.line = ""; }
    if (t.name === "c-gamme") { S.gamme = v; S.line = ""; S.manual = false; S.showAll = false; }
    if (t.name === "c-line") { S.line = v; S.manual = false; }
    if (t.name === "c-power") { const line = lignes(S.gamme).find(l => l.k === S.line); if (line) { S.model = line.models[+v]; S.manual = true; } }
    if (t.name === "c-liaison") S.liaison = +v;
    if (t.name === "c-contrat") S.contrat = v === "1";
    if (t.id === "c-delai") { S.delai = v; return; }
    if (t.name && t.name.startsWith("c-")) render();
  });
  root.addEventListener("input", e => {
    const map = { "c-nom": "nom", "c-tel": "tel", "c-mail": "mail", "c-commune": "commune", "c-msg": "msg" };
    if (map[e.target.id]) S[map[e.target.id]] = e.target.value;
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-room]");
    if (b) {
      const i = +b.dataset.room, d = +b.dataset.d;
      if (i < 0) { S.m2 = Math.max(8, Math.min(80, S.m2 + d)); S.rooms = [S.m2]; }
      else S.rooms[i] = Math.max(8, Math.min(80, S.rooms[i] + d));
      S.manual = false; render(); return;
    }
    if (e.target.closest("[data-more]")) { S.showAll = true; render(); return; }
    if (e.target.closest("[data-open-form]")) {
      e.preventDefault();
      const f = $("#c-form"); f.hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => $("#c-nom").focus({ preventScroll: true }), 400);
    }
  });
  // Bouton de la barre du bas (hors du formulaire)
  $$("[data-open-form]").forEach(a => a.closest("#cfg") || a.addEventListener("click", e => {
    e.preventDefault(); const f = $("#c-form"); f.hidden = false; f.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  root.addEventListener("submit", async e => {
    e.preventDefault();
    const err = !S.nom.trim() ? "Indiquez votre nom." : S.tel.replace(/\D/g, "").length < 10 ? "Indiquez un numéro de téléphone valide." : !S.commune.trim() ? "Indiquez votre commune." : !S.model ? "Choisissez un modèle." : "";
    $("#c-err").textContent = err;
    if (err) return;
    const m = S.model, T = TYPES[S.type];
    const fields = {
      prestation: "Installation (configurateur)",
      type: T.l,
      modele: m.b + " " + m.g + " " + kwTxt(m.kw),
      pieces: multi() || S.type === "gainable" ? S.rooms.map((x, i) => "pièce " + (i + 1) + " : " + x + " m²").join(", ") : S.m2 + " m²",
      liaison: multi() ? "comprise (pose standard)" : S.type === "monobloc" ? "sans" : (liaisons().find(o => o.v === S.liaison) || {}).l,
      contrat_entretien: S.contrat ? "oui, " + CONTRAT * units() + " €/an" : "non",
      offre: ENTRETIEN_OFFERT ? "1er entretien offert si signé avant le 15/11" : "",
      estimation: euro(total()) + " TTC (configurateur)",
      commune: S.commune, delai: S.delai,
      nom: S.nom, telephone: S.tel, email: S.mail, message: S.msg
    };
    $("#c-send").disabled = true;
    const ok = window.thermazSendLead ? await window.thermazSendLead(fields, $("#c-status")) : false;
    if (!ok) $("#c-send").disabled = false;
  });

  /* ---- Préréglage depuis un lien (cartes de prix, devis) : ?type=murale&m2=35&gamme=pre&pieces=2 ---- */
  (function preset() {
    const q = new URLSearchParams(location.search);
    const type = q.get("type");
    if (TYPES[type]) S.type = type;
    S.m2 = Math.max(8, Math.min(80, +q.get("m2") || 25));
    if (S.type === "multi") { const n = Math.max(2, Math.min(4, +q.get("pieces") || 2)); S.rooms = [18, 12, 12, 12].slice(0, n); }
    else if (S.type === "gainable") S.rooms = [18, 17];   // ≈ 35 m², le plus petit gainable (prix « à partir de » des cartes)
    else S.rooms = [S.m2];
    if (q.get("gamme") === "pre") S.gamme = "pre";
  })();

  /* ---- Démarrage ---- */
  fetch("data/catalogue.json").then(r => r.json()).then(d => { CAT = d; render(); }).catch(() => {
    $("#c-form").hidden = false;
    $("#c-err").textContent = "Le catalogue n'a pas pu se charger. Appelez le 06 51 10 64 35, je vous donne le prix au téléphone.";
  });
})();
