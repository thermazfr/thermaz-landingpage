/* Thermaz, espace admin (v2, pensée pour le téléphone).
   Les données ne sont jamais dans ce fichier : elles viennent de l'API Apps Script,
   qui refuse toute demande sans jeton de session valide.
   Tout est affiché avec textContent (jamais innerHTML avec des données) pour bloquer les injections. */
(() => {
  "use strict";

  // URL /exec de l'API admin (projet Apps Script « Thermaz Admin API »).
  const API_URL = "https://script.google.com/macros/s/AKfycbxePxnHl8FiHMrCn6O8SJbn3LiGjTtBUezzQGw8p3IvoVlFAWyJTKAKblQ2iOuzql6H/exec";
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Mode démo (données fictives) seulement sur l'ordinateur d'Andy, jamais sur thermaz.fr.
  const DEMO = LOCAL && (!API_URL || new URLSearchParams(location.search).has("demo"));
  const TK = "thz_admin_token";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get() { try { return localStorage.getItem(TK) || ""; } catch (e) { return ""; } },
    set(v) { try { v ? localStorage.setItem(TK, v) : localStorage.removeItem(TK); } catch (e) {} }
  };
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  function icon(id, size = 18) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#i-" + id); s.append(u);
    return s;
  }
  const euro = n => (Math.round(Number(n) || 0)).toLocaleString("fr-FR") + " €";
  const show = id => { for (const v of ["v-load", "v-login", "v-setup", "v-app"]) $("#" + v).hidden = v !== id; };
  const msg = (id, t, ok) => { const m = $("#" + id); m.textContent = t || ""; m.classList.toggle("ok", !!ok); };
  let toastT;
  function toast(t) {
    let n = $(".ad-toast"); if (!n) { n = el("div", { class: "ad-toast", role: "status" }); document.body.append(n); }
    n.textContent = t; n.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { n.hidden = true; }, 2600);
  }

  const ERR = {
    bad: "Identifiant ou mot de passe incorrect.",
    code: "Code incorrect ou expiré.",
    expired: "La demande a expiré, recommence la connexion.",
    locked: "Trop d'essais : l'accès est bloqué 15 minutes. Une alerte t'a été envoyée.",
    wait: "Attends une minute avant de redemander un code.",
    no_setup: "Aucun accès n'existe encore : crée-le d'abord.",
    id_court: "Identifiant trop court (3 caractères minimum).",
    mdp_court: "Mot de passe trop court (10 caractères minimum).",
    conflit: "La ligne a changé dans le CRM entre-temps. Actualise puis recommence.",
    statut: "Cette étape n'existe pas dans le CRM.",
    nom: "Indique au moins un nom.",
    unknown_action: "Cette action n'est pas encore active sur le serveur.",
    network: "Pas de connexion au serveur. Vérifie ton réseau.",
    server: "Erreur du serveur. Réessaie dans un instant."
  };
  const err = r => ERR[r && r.error] || (r && r.detail) || ERR.server;

  /* ---------------- Appels à l'API ---------------- */
  async function api(action, data = {}) {
    if (DEMO) return demo(action, data);
    let r;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...data, action, token: store.get() }),
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
      });
      r = await res.json();
    } catch (e) { return { ok: false, error: "network" }; }
    if (r && r.error === "auth") { store.set(""); state.data = null; startLogin(); }
    return r || { ok: false, error: "server" };
  }

  /* ---------------- État et étapes ---------------- */
  const state = { view: "today", data: null, today: null, q: "", cq: "", statuts: [], current: null, pend: null, nonce: "" };
  const FLOW = ["Nouveau", "Rappelé", "Visite prévue", "Devis envoyé", "Signé", "Acompte reçu", "Posé", "Soldé"];
  const SIDE = ["Perdu", "Hors cible"];
  const COURT = { "Visite prévue": "Visite", "Devis envoyé": "Devis", "Acompte reçu": "Acompte" };
  const GAGNES = ["Signé", "Acompte reçu", "Posé", "Soldé"];
  const GROUPES = [
    { t: "Nouveaux, à rappeler", f: s => s === "" || s === "Nouveau", open: true },
    { t: "En cours", f: s => s === "Rappelé" || s === "Visite prévue", open: true },
    { t: "Devis envoyés", f: s => s === "Devis envoyé", open: true },
    { t: "Gagnés", f: s => GAGNES.includes(s), open: false },
    { t: "Perdus et hors cible", f: s => SIDE.includes(s), open: false }
  ];

  const pad = n => String(n).padStart(2, "0");
  const ddmm = d => pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
  function dateDans(t) {
    const m = String(t || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!m) return null;
    const now = new Date(); let y = m[3] ? Number(m[3]) : now.getFullYear(); if (y < 100) y += 2000;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  const debutJour = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  function quand(t) {
    const d = dateDans(t); if (!d) return null;
    const diff = Math.round((debutJour(d) - debutJour()) / 864e5);
    return { diff, label: diff < 0 ? "en retard de " + (-diff) + " j" : diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : "dans " + diff + " j" };
  }

  /* ---------------- Connexion ---------------- */
  function startLogin() {
    show("v-login");
    $("#f-login").hidden = false; $("#f-code").hidden = true;
    msg("m-login", ""); msg("m-code", "");
    setTimeout(() => $("#l-id").focus(), 50);
  }
  function device() {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Appareil";
    const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "navigateur";
    return os + " · " + nav;
  }
  async function busy(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } finally { if (btn) btn.disabled = false; } }

  $("#f-login").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const r = await api("login", { id: $("#l-id").value, pwd: $("#l-mdp").value });
      if (!r.ok) return msg("m-login", err(r));
      state.nonce = r.nonce; $("#l-mdp").value = "";
      $("#f-login").hidden = true; $("#f-code").hidden = false; $("#l-code").focus();
    });
  });
  $("#f-code").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const r = await api("loginCode", { nonce: state.nonce, code: $("#l-code").value, device: device() });
      if (!r.ok) return msg("m-code", err(r));
      store.set(r.token); $("#l-code").value = ""; openApp();
    });
  });
  $("#b-setup").addEventListener("click", () => { show("v-setup"); msg("m-setup", ""); });
  $("#b-retour").addEventListener("click", startLogin);
  $("#b-sendcode").addEventListener("click", e => busy(e.currentTarget, async () => {
    const r = await api("sendSetupCode");
    msg("m-setup", r.ok ? "Code envoyé. Regarde ta boîte mail Thermaz." : err(r), r.ok);
  }));
  $("#f-setup").addEventListener("submit", e => {
    e.preventDefault();
    if ($("#s-mdp").value !== $("#s-mdp2").value) return msg("m-setup", "Les deux mots de passe ne sont pas identiques.");
    busy(e.submitter, async () => {
      const r = await api("setup", { code: $("#s-code").value, id: $("#s-id").value, pwd: $("#s-mdp").value });
      if (!r.ok) return msg("m-setup", err(r));
      $("#s-mdp").value = $("#s-mdp2").value = $("#s-code").value = "";
      store.set(""); startLogin(); msg("m-login", "Accès enregistré. Connecte-toi.", true);
    });
  });

  /* ---------------- Application ---------------- */
  async function openApp() { show("v-app"); $("#demo").hidden = !DEMO; await refresh(true); }
  async function refresh(silent) {
    const b = $("#b-refresh"); b.classList.add("spin");
    const [t, d] = await Promise.all([api("today"), api("demandes")]);
    b.classList.remove("spin");
    if (!t.ok || !d.ok) { if (t.error !== "auth" && d.error !== "auth") toast(err(t.ok ? d : t)); return; }
    state.today = t; state.data = d.rows; state.statuts = d.statuts || FLOW.concat(SIDE);
    render();
    if (!silent) toast("À jour");
  }
  $("#b-refresh").addEventListener("click", () => refresh());

  const TITRES = { today: "Aujourd'hui", demandes: "Demandes", clients: "Clients", argent: "Argent", plus: "Plus" };
  $$(".ad-nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.v)));
  function go(v) {
    state.view = v;
    $$(".ad-nav button").forEach(b => b.dataset.v === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
    $$("[data-s]").forEach(s => s.hidden = s.dataset.s !== v);
    $("#titre").textContent = TITRES[v];
    render(); window.scrollTo(0, 0);
  }
  function render() {
    if (!state.data) return;
    $("#dot-today").hidden = !aFaire().length;
    ({ today: renderToday, demandes: renderDemandes, clients: renderClients, argent: renderArgent, plus: renderPlus })[state.view]();
  }

  /* ----- Cartes ----- */
  const tel = t => { const d = String(t || "").replace(/[^\d+]/g, ""); return d.startsWith("0") ? "+33" + d.slice(1) : d; };
  function carte(r, ligne) {
    const t = tel(r.tel), q = quand(r.action);
    return el("article", { class: "ad-item" },
      el("button", { class: "ad-item-main", type: "button", onclick: () => openFiche(r) },
        el("span", { class: "ad-item-top" }, el("b", { text: r.nom || "(sans nom)" }), el("span", { class: "ad-badge", "data-s": r.statut || "", text: r.statut || "Nouveau" })),
        el("small", { text: [r.commune, r.prestation, r.montantNum ? euro(r.montantNum) : ""].filter(Boolean).join(" · ") }),
        ligne !== false && r.action ? el("span", { class: "ad-next" + (q && q.diff < 0 ? " late" : ""), text: "→ " + r.action + (q ? " (" + q.label + ")" : "") })
          : el("small", { text: "Reçue le " + r.recu })),
      el("div", { class: "ad-item-acts" },
        t ? el("a", { href: "tel:" + t }, icon("phone", 16), "Appeler") : null,
        t ? el("a", { href: "https://wa.me/" + t.replace("+", ""), target: "_blank", rel: "noopener noreferrer" }, icon("chat", 16), "WhatsApp") : null,
        el("button", { type: "button", onclick: () => openFiche(r) }, "Ouvrir")));
  }

  /* ----- Aujourd'hui ----- */
  function aFaire() {
    const t = state.today; if (!t) return [];
    const vus = new Set(), l = [];
    for (const r of [...t.nouveaux, ...t.relances]) if (!vus.has(r.row)) { vus.add(r.row); l.push(r); }
    return l;
  }
  function renderToday() {
    const t = state.today, c = t.chiffres, s = $("#s-today"), todo = aFaire();
    const h = new Date().getHours();
    s.replaceChildren(
      el("div", {}, el("p", { class: "ad-hello", text: (h < 18 ? "Bonjour Andy" : "Bonsoir Andy") }),
        el("p", { class: "ad-muted", text: new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " · " + (todo.length ? todo.length + (todo.length > 1 ? " choses à faire" : " chose à faire") : "rien d'urgent") })),
      el("h2", { class: "ad-h2", text: "En un coup d'œil" }),
      el("div", { class: "ad-tiles" },
        el("button", { class: "ad-tile", type: "button", onclick: () => go("demandes") }, el("b", { text: euro(c.attenteMontant) }), el("span", { text: c.attenteNb + " devis en attente" })),
        el("button", { class: "ad-tile", type: "button", onclick: () => go("demandes") }, el("b", { text: euro(c.signesMontant) }), el("span", { text: c.signesNb + (c.signesNb > 1 ? " devis signés" : " devis signé") })),
        el("button", { class: "ad-tile", type: "button", onclick: () => go("demandes") }, el("b", { text: c.demandesNb }), el("span", { text: "demandes au total" })),
        el("button", { class: "ad-tile", type: "button", onclick: () => go("clients") }, el("b", { text: clients().length }), el("span", { text: "clients" }))),
      el("h2", { class: "ad-h2", text: "Rendez-vous aujourd'hui et demain" }),
      t.rdv.length ? el("div", { class: "ad-list" }, t.rdv.map(ev => el("article", { class: "ad-item" }, el("div", { class: "ad-item-main" },
        el("span", { class: "ad-item-top" }, el("b", { text: ev.titre })),
        el("small", { text: ev.journee ? "Toute la journée" : new Date(ev.debut).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" }) }),
        ev.lieu ? el("small", { text: ev.lieu }) : null),
        ev.lieu ? el("div", { class: "ad-item-acts" }, el("a", { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.lieu), target: "_blank", rel: "noopener noreferrer" }, icon("map", 16), "Itinéraire")) : null)))
        : el("p", { class: "ad-empty", text: "Aucun rendez-vous dans l'agenda." }),
      el("h2", { class: "ad-h2" }, "À faire maintenant", todo.length ? el("b", { text: todo.length }) : null),
      todo.length ? el("div", { class: "ad-list" }, todo.map(r => carte(r))) : el("p", { class: "ad-empty", text: "Personne à rappeler et aucune relance pour aujourd'hui. Profite." }));
  }

  /* ----- Demandes ----- */
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function cherche(r) {
    const q = norm(state.q); if (!q) return true;
    const qd = q.replace(/\D/g, "");
    return norm([r.nom, r.commune, r.prestation, r.details, r.email, r.action].join(" ")).includes(q) || (qd.length >= 4 && r.tel.replace(/\D/g, "").includes(qd));
  }
  function renderDemandes() {
    const rows = state.data.filter(cherche).slice().reverse();
    const box = $("#d-liste");
    if (!rows.length) return box.replaceChildren(el("p", { class: "ad-empty", text: "Aucune demande ne correspond." }));
    box.replaceChildren(...GROUPES.map(g => {
      const l = rows.filter(r => g.f(r.statut || ""));
      if (!l.length) return null;
      return el("details", { class: "ad-group", open: g.open || !!state.q },
        el("summary", {}, el("span", { class: "ad-h2" }, g.t, el("b", { text: l.length }))),
        el("div", { class: "ad-list" }, l.map(r => carte(r))));
    }).filter(Boolean));
  }
  $("#d-q").addEventListener("input", e => { state.q = e.target.value; renderDemandes(); });

  /* ----- Fiche ----- */
  function openFiche(r) {
    state.current = r; state.pend = { statut: r.statut || "Nouveau" };
    $("#fi-nom").textContent = r.nom || "(sans nom)";
    $("#fi-sous").textContent = [r.prestation, r.commune, "reçue le " + r.recu].filter(Boolean).join(" · ");
    const t = tel(r.tel);
    const quick = (ok, attrs, ic, txt) => el("a", { class: ok ? null : "off", ...(ok ? attrs : {}), "aria-disabled": ok ? null : "true" }, icon(ic, 20), txt);
    $("#fi-actions").replaceChildren(
      quick(!!t, { href: "tel:" + t }, "phone", "Appeler"),
      quick(!!t, { href: "https://wa.me/" + t.replace("+", ""), target: "_blank", rel: "noopener noreferrer" }, "chat", "WhatsApp"),
      quick(!!r.email, { href: "mailto:" + r.email }, "mail", "E-mail"),
      quick(!!r.commune, { href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.commune), target: "_blank", rel: "noopener noreferrer" }, "map", "Itinéraire"));
    drawSteps();
    $("#fi-action").value = r.action || "";
    $("#fi-dates").replaceChildren(...[["Aujourd'hui", 0], ["Demain", 1], ["Dans 3 jours", 3], ["Dans 1 semaine", 7], ["Effacer", null]].map(([t2, n]) => el("button", { type: "button", text: t2, onclick: () => setDate(n) })));
    $("#fi-note").value = "";
    $("#fi-notes-rapides").replaceChildren(...["Pas de réponse", "Message laissé", "Rappelé", "Visite fixée", "Devis envoyé", "Attend l'accord", "Trop cher"].map(t2 => el("button", { type: "button", text: t2, onclick: () => { const n = $("#fi-note"); n.value = (n.value ? n.value.replace(/\s*$/, "") + ". " : "") + t2; } })));
    $("#fi-notes").textContent = r.notes || "";
    $("#fi-montant").value = r.montantNum || "";
    const infos = [["Téléphone", r.tel], ["E-mail", r.email], ["Détails", r.details], ["Message", r.message], ["Estimation", r.estimation], ["Origine", [r.source, r.connu].filter(Boolean).join(" · ")], ["Ligne du CRM", String(r.row)]];
    $("#fi-infos").replaceChildren(...infos.filter(i => i[1]).flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
    msg("m-fiche", "");
    $("#fiche").showModal();
  }
  function drawSteps() {
    const all = state.statuts.length ? state.statuts : FLOW.concat(SIDE);
    const flow = FLOW.filter(s => all.includes(s));
    const autres = all.filter(s => !flow.includes(s));
    const cur = state.pend.statut, idx = flow.indexOf(cur);
    $("#fi-steps").replaceChildren(...flow.map((s, i) => el("li", { class: i === idx ? "cur" : i < idx ? "done" : null },
      el("button", { type: "button", "aria-pressed": String(i === idx), text: COURT[s] || s, title: s, onclick: () => { state.pend.statut = s; drawSteps(); } }))));
    $("#fi-side").replaceChildren(...autres.map(s => el("button", { type: "button", "aria-pressed": String(s === cur), text: s, onclick: () => { state.pend.statut = s; drawSteps(); } })));
  }
  function setDate(n) {
    const inp = $("#fi-action");
    if (n === null) { inp.value = ""; return; }
    const d = new Date(); d.setDate(d.getDate() + n);
    const v = inp.value.trim(), re = /\d{1,2}\/\d{1,2}(\/\d{2,4})?/;
    inp.value = re.test(v) ? v.replace(re, ddmm(d)) : v ? v + " le " + ddmm(d) : "Rappeler le " + ddmm(d);
  }
  $$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
  $("#fi-save").addEventListener("click", e => busy(e.currentTarget, async () => {
    const r = state.current, f = {};
    const st = state.pend.statut, ac = $("#fi-action").value.trim(), mo = $("#fi-montant").value.trim(), no = $("#fi-note").value.trim();
    if (st !== (r.statut || "") ) f.statut = st;
    if (ac !== (r.action || "")) f.action = ac;
    if (mo !== String(r.montantNum || "")) f.montant = mo;
    if (no) f.noteAjout = no;
    if (!Object.keys(f).length) { $("#fiche").close(); return; }
    const res = await api("update", { row: r.row, nom: r.nom, fields: f });
    if (!res.ok) return msg("m-fiche", err(res));
    $("#fiche").close(); toast("Enregistré dans le CRM");
    await refresh(true);
  }));

  /* ----- Nouvelle demande ----- */
  const PRESTA = ["Installation", "Entretien", "Dépannage", "Remplacement", "Mise en service", "Autre"];
  const SOURCES = { "Appel Google Ads": ["Appel Google Ads", ""], "Appel direct": ["Autre", "Appel direct"], "Bouche-à-oreille": ["Autre", "Bouche-à-oreille"], "Facebook / Instagram": ["Autre", "Facebook / Instagram"], "Client existant": ["Autre", "Client existant"], "Autre": ["Autre", ""] };
  const pick = { presta: "", source: "" };
  function chipsPick(box, list, key) {
    box.replaceChildren(...list.map(v => el("button", { type: "button", "aria-pressed": String(pick[key] === v), text: v, onclick: () => { pick[key] = pick[key] === v ? "" : v; chipsPick(box, list, key); } })));
  }
  $("#b-new").addEventListener("click", () => {
    $("#f-new").reset(); pick.presta = pick.source = ""; msg("m-new", "");
    chipsPick($("#nv-presta"), PRESTA, "presta"); chipsPick($("#nv-source"), Object.keys(SOURCES), "source");
    $("#nouveau").showModal(); setTimeout(() => $("#nv-nom").focus(), 60);
  });
  $("#f-new").addEventListener("submit", e => {
    e.preventDefault();
    busy(e.submitter, async () => {
      const src = SOURCES[pick.source] || ["", ""];
      const res = await api("add", { fields: { nom: $("#nv-nom").value.trim(), tel: $("#nv-tel").value.trim(), commune: $("#nv-commune").value.trim(), prestation: pick.presta, details: $("#nv-details").value.trim(), source: src[0], connu: src[1] } });
      if (!res.ok) return msg("m-new", err(res));
      $("#nouveau").close(); toast("Demande créée dans le CRM");
      await refresh(true);
      const n = state.data.find(x => x.row === res.row); if (n) openFiche(n);
    });
  });

  /* ----- Clients ----- */
  function clients() {
    const map = new Map();
    for (const r of state.data || []) {
      const k = r.tel.replace(/\D/g, "").slice(-9) || norm(r.email) || norm(r.nom);
      if (!k) continue;
      const c = map.get(k) || { nom: r.nom, commune: r.commune, tel: r.tel, rows: [] };
      c.rows.push(r); if (r.commune) c.commune = r.commune;
      map.set(k, c);
    }
    return [...map.values()].map(c => ({ ...c, gagne: c.rows.filter(r => GAGNES.includes(r.statut)).reduce((t, r) => t + r.montantNum, 0) }));
  }
  function renderClients() {
    const q = norm(state.cq);
    const list = clients().filter(c => !q || norm(c.nom + " " + c.commune).includes(q)).sort((a, b) => b.gagne - a.gagne || a.nom.localeCompare(b.nom));
    $("#c-liste").replaceChildren(...(list.length ? list.map(c => {
      const t = tel(c.tel);
      return el("article", { class: "ad-item" },
        el("button", { class: "ad-item-main", type: "button", onclick: () => { state.q = c.nom; $("#d-q").value = c.nom; go("demandes"); } },
          el("span", { class: "ad-item-top" }, el("b", { text: c.nom || "(sans nom)" }), c.gagne ? el("span", { class: "ad-badge", "data-s": "Signé", text: euro(c.gagne) }) : null),
          el("small", { text: [c.commune, c.rows.length + (c.rows.length > 1 ? " demandes" : " demande"), [...new Set(c.rows.map(r => r.prestation).filter(Boolean))].join(", ")].filter(Boolean).join(" · ") })),
        t ? el("div", { class: "ad-item-acts" }, el("a", { href: "tel:" + t }, icon("phone", 16), "Appeler"), el("a", { href: "https://wa.me/" + t.replace("+", ""), target: "_blank", rel: "noopener noreferrer" }, icon("chat", 16), "WhatsApp")) : null);
    }) : [el("p", { class: "ad-empty", text: "Aucun client." })]));
  }
  $("#c-q").addEventListener("input", e => { state.cq = e.target.value; renderClients(); });

  /* ----- Argent (phase 2) ----- */
  function soon(items) { return el("ul", { class: "ad-soon" }, items.map(([b, s]) => el("li", {}, el("b", { text: b }), el("span", { text: s })))); }
  function renderArgent() {
    const c = state.today.chiffres;
    $("#s-argent").replaceChildren(
      el("div", { class: "ad-panel" }, el("h3", { text: "Ce qui est déjà suivi" }),
        el("div", { class: "ad-row" }, el("span", { text: "Devis en attente" }), el("b", { text: euro(c.attenteMontant) + " (" + c.attenteNb + ")" })),
        el("div", { class: "ad-row" }, el("span", { text: "Devis signés, total" }), el("b", { text: euro(c.signesMontant) + " (" + c.signesNb + ")" }))),
      el("h2", { class: "ad-h2", text: "Arrive à la prochaine étape" }),
      soon([["Livre des recettes", "Tenu automatiquement, obligatoire en micro-entreprise"], ["Factures et avoirs", "Numérotation continue, HT, TVA, TTC, payée ou en retard"], ["Encaissements", "Acomptes et soldes, par virement, chèque, espèces ou carte"], ["Dépenses et justificatifs", "Matériel par chantier, carburant, Google Ads, assurances, photo du ticket"], ["Marge par chantier", "Devis moins matériel et déplacement"], ["Compteurs", "Seuil de TVA, plafond micro, argent à mettre de côté pour l'URSSAF"], ["Export comptable", "Un tableur par mois pour le comptable"]]));
  }

  /* ----- Plus ----- */
  async function renderPlus() {
    const s = $("#s-plus");
    s.replaceChildren(el("p", { class: "ad-muted", text: "Chargement…" }));
    const r = await api("security");
    const secu = el("div", { class: "ad-panel" }, el("h3", { text: "Sécurité" }));
    if (r.ok) {
      secu.append(el("p", { class: "ad-muted", text: "Appareils connectés" }),
        ...r.sessions.map(x => el("div", { class: "ad-row" }, el("span", { text: x.device + (x.current ? " (celui-ci)" : "") }), el("b", { text: new Date(x.last).toLocaleDateString("fr-FR") }))),
        el("p", { class: "ad-muted", text: "Dernières activités" }),
        ...r.journal.slice(0, 8).map(j => el("div", { class: "ad-row" }, el("span", { text: j.msg }), el("b", { text: new Date(j.t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) }))));
    }
    secu.append(
      el("button", { class: "ad-btn", type: "button", text: "Se déconnecter", onclick: async () => { await api("logout"); store.set(""); startLogin(); } }),
      el("button", { class: "ad-btn ad-btn--danger", type: "button", text: "Déconnecter tous les appareils", onclick: async () => { if (!confirm("Déconnecter tous les appareils, y compris celui-ci ?")) return; await api("logoutAll"); store.set(""); startLogin(); } }));
    s.replaceChildren(secu,
      el("h2", { class: "ad-h2", text: "Sections à venir" }),
      soon([["Chantiers", "Date de pose, matériel commandé ou reçu, acompte, solde, mise en service"], ["Entretiens et contrats", "Contrats, prochains entretiens, rappels de printemps"], ["Statistiques", "Demandes par origine, taux de transformation, coût d'un client Google Ads"], ["Prix et catalogue", "Barème d'entretien, zones, matériel avec prix d'achat et marge"], ["Conformité", "Attestation fluides, décennale, RC pro, registre des fluides, alertes d'expiration"], ["Secrétaire", "Journal de l'agent qui tourne toutes les heures"], ["Banque (plus tard, à part)", "Lecture seule après l'ouverture du compte pro, jamais affichée en détail ici"]]));
  }

  /* ---------------- Démarrage ---------------- */
  async function start() {
    if (DEMO) return openApp();
    if (!API_URL) { startLogin(); $("#f-login button").disabled = true; return msg("m-login", "L'espace admin n'est pas encore branché."); }
    if (!store.get()) return startLogin();
    show("v-load");
    const r = await api("today");
    if (r.ok) openApp(); else if (r.error !== "auth") { startLogin(); msg("m-login", err(r)); }
  }

  /* ---------------- Données de démonstration (fictives) ---------------- */
  const D = (() => {
    const j = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("fr-FR"); };
    const jm = n => j(n).slice(0, 5);
    const rows = [
      ["Signé", "Client Démo A", "06 00 00 00 01", "", "Salon-de-Provence", "Entretien", "Nettoyage 1 unité", "", "", "Autre", "Bouche-à-oreille", "", "130", ""],
      ["Devis envoyé", "Client Démo B", "06 00 00 00 02", "demo.b@exemple.fr", "Istres", "Remplacement", "Tri-split, sinistre", "", "", "Appel Google Ads", "", "Relancer le " + jm(0), "4900", "[" + jm(-5) + " 10:12] Devis envoyé"],
      ["Devis envoyé", "Client Démo C", "06 00 00 00 03", "demo.c@exemple.fr", "Aix-en-Provence", "Installation", "Bi-split 2 pièces", "", "dès 3 618 €", "Site - Google Ads", "", "Envoyer les autres modèles le " + jm(-1), "3640", ""],
      ["Rappelé", "Client Démo D", "06 00 00 00 04", "", "Saint-Chamas", "Dépannage", "Clim en panne après la pluie", "", "", "Autre", "", "Diagnostic le " + jm(1) + " à 16h", "", ""],
      ["", "Client Démo E", "06 00 00 00 05", "demo.e@exemple.fr", "Pélissanne", "Entretien", "2 unités", "Bonjour, je voudrais un entretien", "293 €", "Site - Google Ads", "", "", "", ""],
      ["Hors cible", "Client Démo F", "", "demo.f@exemple.fr", "Salon-de-Provence", "Installation", "Pièce 38 m²", "", "", "Site - Google Ads", "", "", "", ""]
    ];
    return {
      rows: rows.map((v, i) => ({ row: i + 2, recu: j(-12 + i * 2), statut: v[0], nom: v[1], tel: v[2], email: v[3], commune: v[4], prestation: v[5], details: v[6], message: v[7], estimation: v[8], source: v[9], connu: v[10], action: v[11], montant: v[12], montantNum: Number(v[12]) || 0, notes: v[13] })),
      journal: [{ t: new Date().toISOString(), msg: "Connexion réussie : Windows · Chrome (démo)" }]
    };
  })();
  function demo(action, data) {
    const rows = D.rows;
    const today = () => {
      const auj = new Date(); auj.setHours(23, 59, 0, 0);
      const att = rows.filter(r => r.statut === "Devis envoyé"), sig = rows.filter(r => GAGNES.includes(r.statut));
      return { ok: true, nouveaux: rows.filter(r => !r.statut || r.statut === "Nouveau"), relances: rows.filter(r => !GAGNES.concat(SIDE).includes(r.statut) && dateDans(r.action) && dateDans(r.action) <= auj),
        rdv: [{ titre: "Entretien (démo)", debut: new Date(Date.now() + 36e5).toISOString(), lieu: "Saint-Martin-de-Crau", journee: false }],
        chiffres: { attenteNb: att.length, attenteMontant: att.reduce((t, r) => t + r.montantNum, 0), signesNb: sig.length, signesMontant: sig.reduce((t, r) => t + r.montantNum, 0), demandesNb: rows.length } };
    };
    switch (action) {
      case "today": return today();
      case "demandes": return { ok: true, rows: rows.map(r => ({ ...r })), statuts: FLOW.concat(SIDE) };
      case "add": {
        const f = data.fields; if (!f.nom) return { ok: false, error: "nom" };
        const row = rows.length + 2;
        rows.push({ row, recu: new Date().toLocaleDateString("fr-FR"), statut: "Nouveau", nom: f.nom, tel: f.tel, email: "", commune: f.commune, prestation: f.prestation, details: f.details, message: "", estimation: "", source: f.source, connu: f.connu, action: "", montant: "", montantNum: 0, notes: "" });
        return { ok: true, row };
      }
      case "update": {
        const r = rows.find(x => x.row === data.row); if (!r) return { ok: false, error: "ligne" };
        const f = data.fields;
        if (f.statut !== undefined) r.statut = f.statut;
        if (f.action !== undefined) r.action = f.action;
        if (f.montant !== undefined) { r.montantNum = Number(String(f.montant).replace(",", ".")) || 0; r.montant = f.montant; }
        if (f.noteAjout) r.notes = (r.notes ? r.notes + "\n" : "") + "[" + new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "") + "] " + f.noteAjout;
        D.journal.unshift({ t: new Date().toISOString(), msg: "Modifié ligne " + r.row + " (" + r.nom + ")" });
        return { ok: true };
      }
      case "security": return { ok: true, sessions: [{ device: "Windows · Chrome", created: Date.now(), last: Date.now(), current: true }], journal: D.journal };
      default: return { ok: true };
    }
  }

  start();
})();
