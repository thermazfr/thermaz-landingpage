/* Configurateur de prix Thermaz
   Le client choisit son type de clim, ses pièces, son modèle et ses options :
   le prix TTC posé s'affiche en direct, avant qu'il laisse ses coordonnées.
   Prix : data/catalogue.json (grille Thermaz, liaison de base comprise). */
(function () {
  const root = document.getElementById("cfg");
  if (!root) return;

  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => Array.from(r.querySelectorAll(s));
  const euro = n => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " €";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const kwNum = s => parseFloat(String(s).split("+").pop().replace(",", "."));

  /* ---- Réglages ---- */
  const CONTRAT = 149;           // € par an et par unité intérieure
  const ENTRETIEN_OFFERT = new Date() <= new Date("2026-11-15T23:59:59");
  // Supplément de liaison frigorifique (la longueur de base est comprise dans le prix)
  const LIAISON = {
    std: [{ v: 0, l: "Jusqu'à 5 m", s: "Comprise" }, { v: 200, l: "De 5 à 10 m", s: "+200 €" }, { v: 400, l: "Plus de 10 m", s: "+400 €" }],
    gainable: [{ v: 0, l: "Jusqu'à 4 m", s: "Comprise" }, { v: 200, l: "De 4 à 10 m", s: "+200 €" }, { v: 400, l: "Plus de 10 m", s: "+400 €" }]
  };
  const TYPES = {
    murale: { l: "Murale", sub: "Une pièce, montée au mur", t: "mural", u: 1 },
    console: { l: "Console", sub: "Une pièce, posée au sol", t: "console", u: 1 },
    multi: { l: "Plusieurs pièces", sub: "Un seul groupe extérieur", t: "mural", u: 0 },
    gainable: { l: "Gainable", sub: "Invisible, bouches au plafond", t: "gainable", u: 1 },
    monobloc: { l: "Monobloc", sub: "Sans groupe extérieur", t: "monobloc", u: 1 }
  };
  // Photos de vrais chantiers Thermaz, par marque
  const PHOTOS = {
    "Altech": ["photos/murale-altech-renovation.jpg", "Clim Altech posée par Thermaz"],
    "Daikin": ["photos/groupe-daikin-facade-ancienne.jpg", "Groupe Daikin posé par Thermaz"],
    "Mitsubishi Electric": ["photos/groupes-mitsubishi-facade.jpg", "Groupes Mitsubishi Electric posés par Thermaz"],
    "Panasonic": ["photos/groupe-panasonic-facade.jpg", "Groupe Panasonic posé par Thermaz"]
  };
  const PHOTO_CONSOLE_DAIKIN = ["photos/console-daikin.jpg", "Console Daikin posée par Thermaz"];

  /* ---- État ---- */
  const S = { type: "", m2: 25, rooms: [18, 20], gamme: "toutes", marque: "toutes", model: null, liaison: 0, contrat: false,
              bien: "", commune: "", delai: "Dès que possible", nom: "", tel: "", mail: "", source: "", msg: "" };
  let CAT = [];
  let step = 0;
  const steps = $$(".wiz-step");

  /* ---- Calculs ---- */
  function besoin() {                       // puissance conseillée en kW (≈ 100 W/m², à confirmer à la visite)
    if (S.type === "multi") return S.rooms.map(m => m / 10);
    if (S.type === "gainable") return S.rooms.reduce((a, b) => a + b, 0) / 10;
    return S.m2 / 10;
  }
  function units() { return S.model ? S.model.u : (S.type === "multi" ? S.rooms.length : 1); }
  function total() {
    if (!S.model) return null;
    return S.model.p + (S.type === "multi" || S.type === "monobloc" ? 0 : S.liaison);
  }
  function candidats() {
    const T = TYPES[S.type]; if (!T) return [];
    let list = CAT.filter(m => m.t === T.t && (S.type === "multi" ? m.u === S.rooms.length : m.u === 1));
    if (S.gamme !== "toutes") list = list.filter(m => (S.gamme === "pre") === m.pre);
    if (S.marque !== "toutes") list = list.filter(m => m.b === S.marque);
    if (S.type === "multi") {
      // Par gamme, la combinaison la moins chère dont la plus grosse unité couvre la plus grande pièce
      const need = Math.max(...besoin());
      const best = {};
      list.filter(m => kwNum(m.kw) + 0.25 >= need).forEach(m => {
        const key = m.b + "|" + m.g;
        if (!best[key] || best[key].p > m.p) best[key] = m;
      });
      return Object.values(best).sort((a, b) => a.p - b.p);
    }
    // Une pièce : par gamme, le plus petit modèle qui couvre le besoin
    const need = besoin();
    const best = {};
    list.forEach(m => {
      const k = kwNum(m.kw), key = m.b + "|" + m.g;
      if (k + 0.25 < need) return;
      if (!best[key] || kwNum(best[key].kw) > k) best[key] = m;
    });
    return Object.values(best).sort((a, b) => a.p - b.p);
  }
  function puissanceTexte(m) { return m.u === 1 ? m.kw + " kW" : m.kw; }

  /* ---- Affichage ---- */
  function renderRooms() {
    const box = $("#c-rooms");
    const max = S.type === "multi" ? 4 : 8, min = S.type === "multi" ? 2 : 1;
    const nums = []; for (let i = min; i <= max; i++) nums.push(i);
    box.innerHTML =
      '<div class="seg" role="radiogroup" aria-label="Nombre de pièces">' + nums.map(n =>
        '<input type="radio" name="c-nb" id="c-nb' + n + '" value="' + n + '"' + (S.rooms.length === n ? " checked" : "") + '><label for="c-nb' + n + '">' + n + (n === 1 ? " pièce" : " pièces") + "</label>").join("") + "</div>" +
      '<div class="cfg-rooms">' + S.rooms.map((m, i) =>
        '<div class="cfg-room"><span>Pièce ' + (i + 1) + '</span><div class="cfg-step"><button type="button" data-room="' + i + '" data-d="-1" aria-label="Moins de surface pour la pièce ' + (i + 1) + '">−</button><output>' + m + " m²</output>" +
        '<button type="button" data-room="' + i + '" data-d="1" aria-label="Plus de surface pour la pièce ' + (i + 1) + '">+</button></div></div>').join("") + "</div>" +
      '<p class="hint">Surface totale : <b>' + S.rooms.reduce((a, b) => a + b, 0) + " m²</b>" +
      (S.type === "gainable" ? " · puissance conseillée : <b>" + besoin().toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " kW</b> environ" : "") + "</p>";
  }

  function renderModels() {
    const list = candidats();
    const T = TYPES[S.type];
    const pool = CAT.filter(m => m.t === T.t && (S.type === "multi" ? m.u === S.rooms.length : m.u === 1));
    const marques = [...new Set(pool.filter(m => S.gamme === "toutes" || (S.gamme === "pre") === m.pre).map(m => m.b))].sort();
    if (S.marque !== "toutes" && !marques.includes(S.marque)) S.marque = "toutes";
    $("#c-marques").innerHTML = ["toutes"].concat(marques).map(b =>
      '<input type="radio" name="c-marque" id="c-mq-' + esc(b).replace(/\W/g, "") + '" value="' + esc(b) + '"' + (S.marque === b ? " checked" : "") + '><label for="c-mq-' + esc(b).replace(/\W/g, "") + '">' + (b === "toutes" ? "Toutes" : esc(b)) + "</label>").join("");
    if (S.model && !list.includes(S.model)) S.model = null;
    $("#c-models").innerHTML = list.length ? list.map((m, i) => {
      const ph = S.type === "console" && m.b === "Daikin" ? PHOTO_CONSOLE_DAIKIN : PHOTOS[m.b];
      const id = "c-m" + i;
      return '<div class="cfg-model"><input type="radio" name="c-model" id="' + id + '" value="' + i + '"' + (S.model === m ? " checked" : "") + ">" +
        '<label for="' + id + '">' +
        (ph ? '<img src="' + ph[0] + '" alt="' + esc(ph[1]) + '" loading="lazy" width="96" height="96">' : '<span class="cfg-noimg" aria-hidden="true">' + esc(m.b.slice(0, 1)) + "</span>") +
        '<span class="cfg-mtxt"><b>' + esc(m.b) + " " + esc(m.g) + "</b><span>" + esc(puissanceTexte(m)) + " · gamme " + (m.pre ? "premium" : "essentielle") + "</span></span>" +
        '<span class="cfg-mprice">' + euro(m.p) + "<small>posé</small></span></label></div>";
    }).join("") : '<p class="hint">Aucun modèle ne correspond à ce filtre. Choisissez « Toutes » ou appelez-moi : je vous conseille.</p>';
    $("#c-models")._list = list;
    $("#c-count").textContent = list.length + (list.length > 1 ? " modèles" : " modèle") + " pour votre besoin";
  }

  function renderOptions() {
    const box = $("#c-liaison"), wrap = $("#c-liaison-wrap");
    if (S.type === "multi" || S.type === "monobloc") {
      wrap.querySelector("h4").textContent = S.type === "multi" ? "Liaisons frigorifiques" : "Raccordement";
      box.innerHTML = '<p class="hint">' + (S.type === "multi" ? "Comprises pour une pose standard. Je vérifie les longueurs à la visite." : "Pas de liaison : le monobloc n'a pas de groupe extérieur, juste deux bouches dans le mur.") + "</p>";
      S.liaison = 0;
    } else {
      wrap.querySelector("h4").textContent = "Distance entre l'unité intérieure et le groupe extérieur";
      const opts = S.type === "gainable" ? LIAISON.gainable : LIAISON.std;
      if (!opts.some(o => o.v === S.liaison)) S.liaison = 0;
      box.innerHTML = '<div class="seg">' + opts.map((o, i) =>
        '<input type="radio" name="c-liaison" id="c-li' + i + '" value="' + o.v + '"' + (S.liaison === o.v ? " checked" : "") + '><label for="c-li' + i + '">' + o.l + "<small>" + o.s + "</small></label>").join("") + "</div>";
    }
    const n = units();
    $("#c-contrat-txt").textContent = CONTRAT * n + " €/an" + (n > 1 ? " (" + n + " unités)" : "");
  }

  function renderRecap() {
    const T = TYPES[S.type];
    $("#r-type").textContent = T ? T.l : "–";
    $("#r-surface").textContent = !T ? "–" : (S.type === "multi" || S.type === "gainable")
      ? S.rooms.length + " pièce" + (S.rooms.length > 1 ? "s" : "") + ", " + S.rooms.reduce((a, b) => a + b, 0) + " m²" : S.m2 + " m²";
    $("#r-model").textContent = S.model ? S.model.b + " " + S.model.g + " · " + puissanceTexte(S.model) : "–";
    const opts = [];
    if (S.model && S.type !== "multi" && S.type !== "monobloc") opts.push(S.liaison ? "Liaison " + (S.liaison === 200 ? "moyenne" : "longue") + " +" + S.liaison + " €" : "Liaison standard comprise");
    if (S.contrat) opts.push("Contrat " + CONTRAT * units() + " €/an");
    $("#r-opts").textContent = opts.length ? opts.join(" · ") : "–";
    const t = total();
    $("#r-est").textContent = t ? euro(t) : "À calculer";
    $$(".cfg-mini b", document).forEach(b => b.textContent = t ? euro(t) : "–");
    $("#r-offer").hidden = !(ENTRETIEN_OFFERT && t);
  }

  function show(i) {
    step = Math.max(0, Math.min(i, steps.length - 1));
    steps.forEach((s, k) => s.hidden = k !== step);
    $("#c-count-step").textContent = "Étape " + (step + 1) + " / " + steps.length;
    $("#c-name").textContent = steps[step].dataset.name;
    $(".bar i").style.width = ((step + 1) / steps.length * 100) + "%";
    $("#c-prev").hidden = step === 0;
    const last = step === steps.length - 1;
    $("#c-next").hidden = last; $("#c-send").hidden = !last;
    if (steps[step].dataset.name === "Pièces") { if (S.type === "multi" || S.type === "gainable") { $("#c-surface").hidden = true; $("#c-rooms").hidden = false; renderRooms(); } else { $("#c-surface").hidden = false; $("#c-rooms").hidden = true; } }
    if (steps[step].dataset.name === "Modèle") renderModels();
    if (steps[step].dataset.name === "Options") renderOptions();
    $("#c-err").textContent = "";
    renderRecap();
    if (window.innerWidth < 900) root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function valid() {
    const n = steps[step].dataset.name;
    if (n === "Type" && !S.type) return "Choisissez un type de climatisation.";
    if (n === "Modèle" && !S.model) return "Choisissez un modèle (vous pourrez en changer à la visite).";
    if (n === "Coordonnées") {
      if (!S.nom.trim()) return "Indiquez votre nom.";
      if (S.tel.replace(/\D/g, "").length < 10) return "Indiquez un numéro de téléphone valide.";
      if (!S.commune.trim()) return "Indiquez votre commune.";
    }
    return "";
  }

  /* ---- Événements ---- */
  root.addEventListener("change", e => {
    const t = e.target;
    if (t.name === "c-type") { S.type = t.value; S.model = null; S.marque = "toutes"; S.rooms = t.value === "multi" ? [18, 12] : t.value === "gainable" ? [18, 20, 20] : [S.m2]; }
    if (t.name === "c-nb") { const n = +t.value; while (S.rooms.length < n) S.rooms.push(S.rooms.length ? 20 : 18); S.rooms.length = n; S.model = null; renderRooms(); }
    if (t.name === "c-gamme") { S.gamme = t.value; renderModels(); }
    if (t.name === "c-marque") { S.marque = t.value; renderModels(); }
    if (t.name === "c-model") S.model = $("#c-models")._list[+t.value];
    if (t.name === "c-liaison") S.liaison = +t.value;
    if (t.id === "c-contrat") S.contrat = t.checked;
    if (t.name === "c-bien") S.bien = t.value;
    if (t.id === "c-delai") S.delai = t.value;
    if (t.id === "c-source") S.source = t.value;
    renderRecap();
  });
  root.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "c-m2") { S.m2 = +t.value; $("#c-m2-out").textContent = t.value + " m²"; S.model = null; }
    const map = { "c-nom": "nom", "c-tel": "tel", "c-mail": "mail", "c-commune": "commune", "c-msg": "msg" };
    if (map[t.id]) S[map[t.id]] = t.value;
    renderRecap();
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-room]");
    if (!b) return;
    const i = +b.dataset.room;
    S.rooms[i] = Math.max(8, Math.min(80, S.rooms[i] + 2 * +b.dataset.d));
    S.model = null; renderRooms(); renderRecap();
  });
  $("#c-next").addEventListener("click", () => {
    const err = valid();
    if (err) { $("#c-err").textContent = err; return; }
    show(step + 1);
  });
  $("#c-prev").addEventListener("click", () => show(step - 1));

  root.addEventListener("submit", async e => {
    e.preventDefault();
    const err = valid();
    if (err) { $("#c-err").textContent = err; return; }
    const t = total(), m = S.model, T = TYPES[S.type];
    const fields = {
      prestation: "Installation (configurateur)",
      type: T.l,
      modele: m.b + " " + m.g + " " + puissanceTexte(m),
      pieces: S.type === "multi" || S.type === "gainable" ? S.rooms.map((x, i) => "pièce " + (i + 1) + " : " + x + " m²").join(", ") : S.m2 + " m²",
      liaison: S.type === "multi" ? "comprise (pose standard)" : S.type === "monobloc" ? "sans" : (LIAISON[S.type === "gainable" ? "gainable" : "std"].find(o => o.v === S.liaison) || {}).l,
      contrat_entretien: S.contrat ? "oui, " + CONTRAT * units() + " €/an" : "non",
      offre: ENTRETIEN_OFFERT ? "1er entretien offert si signé avant le 15/11" : "",
      estimation: euro(t) + " TTC (configurateur)",
      bien: S.bien, commune: S.commune, delai: S.delai,
      nom: S.nom, telephone: S.tel, email: S.mail, message: S.msg, source: S.source
    };
    $("#c-send").disabled = true;
    const ok = window.thermazSendLead ? await window.thermazSendLead(fields, $("#c-status")) : false;
    if (!ok) $("#c-send").disabled = false;
  });

  /* ---- Préréglage depuis un lien (cartes de prix, devis) : ?type=murale&m2=35&gamme=pre&pieces=2 ---- */
  function preset() {
    const q = new URLSearchParams(location.search);
    const type = q.get("type");
    if (!TYPES[type]) return 0;
    S.type = type;
    const r = $("#c-t-" + type); if (r) r.checked = true;
    const m2 = Math.max(10, Math.min(70, +q.get("m2") || 25));
    S.m2 = m2; $("#c-m2").value = m2; $("#c-m2-out").textContent = m2 + " m²";
    if (type === "multi") { const n = Math.max(2, Math.min(4, +q.get("pieces") || 2)); S.rooms = [18, 12, 12, 12].slice(0, n); }
    else if (type === "gainable") S.rooms = [18, 17];   // ≈ 35 m², le plus petit gainable (prix « à partir de » des cartes)
    else S.rooms = [m2];
    const g = q.get("gamme");
    if (g === "ess" || g === "pre") { S.gamme = g; const gr = $("#c-g-" + g); if (gr) gr.checked = true; }
    // Une pièce : on va droit au choix du modèle ; plusieurs pièces / gainable : on règle d'abord les surfaces
    return type === "multi" || type === "gainable" ? 1 : 2;
  }

  /* ---- Démarrage ---- */
  const start = preset();
  fetch("data/catalogue.json").then(r => r.json()).then(d => { CAT = d; show(start); }).catch(() => {
    $("#c-err").textContent = "Le catalogue n'a pas pu se charger. Appelez le 06 51 10 64 35, je vous donne le prix au téléphone.";
  });
  show(start);
})();
