/* Thermaz : signature en ligne du devis (signer.html?d=<n° devis>&k=<jeton personnel>). */
(function () {
  "use strict";
  const API_URL = "https://script.google.com/macros/s/AKfycbxePxnHl8FiHMrCn6O8SJbn3LiGjTtBUezzQGw8p3IvoVlFAWyJTKAKblQ2iOuzql6H/exec";
  const TEL = "06 51 10 64 35";
  const q = new URLSearchParams(location.search);
  const D = q.get("d") || "", K = q.get("k") || "";
  // Démo locale seulement (ordinateur d'Andy) : localhost + ?demo
  const DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && q.has("demo");
  const app = document.getElementById("app");

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const euro = n => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const show = (...nodes) => app.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
  const msg = (titre, texte) => show(el("h1", { class: "sg-h1", text: titre }), el("p", { class: "sg-msg", text: texte }));

  async function api(action, data) {
    if (DEMO) return demo(action, data);
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...data, action, d: D, k: K }) });
      return await res.json();
    } catch (e) {
      return { ok: false, error: "reseau" };
    }
  }

  let DV = null, choix = 0;
  // Taux d'acompte du devis affiché (30 % pour les devis d'avant le 22/11/2026, 40 % ensuite) : il vient du serveur.
  const pctAc = () => Math.round((DV && DV.acompte ? DV.acompte : 0.3) * 100);

  async function init() {
    if (!DEMO && (!/^D-(\d{4}|TEST)-\d{3,4}$/.test(D) || !/^[a-f0-9]{32}$/.test(K))) return invalide();
    // « vu » prévient Andy que le client a ouvert le devis, sauf si c'est Andy lui-même (espace admin connecté).
    let andy = false;
    try { andy = !!localStorage.getItem("thz_admin_token"); } catch (e) {}
    const r = await api("devisPublic", { vu: !andy && !q.has("apercu") });
    if (!r.ok) return r.error === "reseau" ? msg("Connexion impossible", "Vérifiez votre connexion internet et rechargez la page. En cas de souci, appelez Andy au " + TEL + ".") : invalide();
    DV = r;
    document.title = "Devis " + r.numero + " | Thermaz";
    if (r.signe) return dejaSigne(r);
    if (r.expire) return msg("Ce devis a expiré", "Le devis n° " + r.numero + " était valable jusqu'au " + r.validite + ". Les prix du matériel bougent : appelez Andy au " + TEL + " pour le mettre à jour, c'est rapide.");
    choix = r.options.length > 1 ? 0 : 1;
    chargerAvis();
    rendre();
  }

  /* Présentation façon « carrousel » : vraies photos de chantiers + vrais avis Google (data/avis-google.json, mis à jour tout seul). */
  let AVIS = null;
  async function chargerAvis() {
    try {
      const res = await fetch("data/avis-google.json", { cache: "no-cache" });
      const j = await res.json();
      if (j && j.rating && Array.isArray(j.reviews)) { AVIS = j; const p = document.getElementById("sg-pres"); if (p) p.replaceWith(presentation()); }
    } catch (e) {}
  }

  const PHOTOS = [
    ["assets/hero/groupe-altech-facade-640.jpg", "Groupe Altech en façade"],
    ["assets/hero/groupe-panasonic-toit-terrasse-640.jpg", "Groupe Panasonic sur toit-terrasse"],
    ["assets/hero/murale-bosch-sejour-640.jpg", "Murale Bosch dans un séjour"],
    ["assets/hero/console-daikin.jpg", "Console Daikin dans un salon"]
  ];

  function presentation() {
    // Le nombre d'avis ne s'affiche qu'à partir de 30 (même règle que sur le site) ; avant, la note seule.
    const etoiles = AVIS ? "★ " + String(AVIS.rating).replace(".", ",") + (Number.isInteger(AVIS.rating) ? ",0" : "") + (AVIS.count >= 30 ? " · " + AVIS.count + " avis Google" : " sur Google") : "Avis Google 5 étoiles";
    const slides = [
      el("div", { class: "sg-slide sg-s1" },
        // Chantier terminé seulement (Andy 19/11 : pas de photo de pose en cours avec goulotte apparente).
        el("img", { src: "assets/hero/murale-altech-pool-house-1600.jpg", alt: "Climatisation murale Altech posée par Thermaz dans un pool house", loading: "eager" }),
        el("div", { class: "sg-s1-txt" },
          el("b", { text: "Thermaz" }),
          el("span", { text: "Andy, artisan climaticien à Salon-de-Provence" }),
          el("div", { class: "sg-badges" }, [etoiles, "Sans sous-traitance", "Pose garantie 2 ans"].map(t => el("span", { text: t }))))),
      el("div", { class: "sg-slide sg-s2" },
        el("b", { class: "sg-s-t", text: "Quelques chantiers" }),
        el("div", { class: "sg-grid" }, PHOTOS.map(([src, t]) => el("figure", {}, el("img", { src, alt: t, loading: "lazy" }), el("figcaption", { text: t }))))),
      AVIS && AVIS.reviews.length ? el("div", { class: "sg-slide sg-s3" },
        el("b", { class: "sg-s-t", text: etoiles }),
        AVIS.reviews.filter(a => a.text && a.stars >= 5).slice(0, 3).map(a =>
          el("blockquote", {}, el("p", { text: "« " + (a.text.length > 120 ? a.text.slice(0, 115).replace(/\s+\S*$/, "") + "… »" : a.text + " »") }),
            el("cite", { text: "★★★★★ " + a.name + (a.when ? " · " + a.when : "") }))),
        /^https:\/\/(maps\.google\.com|www\.google\.com)\//.test(AVIS.url || "") ? el("a", { href: AVIS.url, target: "_blank", rel: "noopener", text: "Voir tous les avis sur Google" }) : null) : null
    ].filter(Boolean);
    const piste = el("div", { class: "sg-track", tabindex: "0", "aria-label": "Présentation de Thermaz, faites glisser" }, slides);
    // Défilement fluide via CSS (scroll-behavior), plus fiable que scrollBy({behavior}) avec le « snap ».
    const aller = i => { const n = slides.length; piste.scrollLeft = ((i % n) + n) % n * piste.clientWidth; };
    const ici = () => Math.round(piste.scrollLeft / Math.max(1, piste.clientWidth));
    const points = el("div", { class: "sg-dots" }, slides.map((s, i) => el("button", { type: "button", "aria-label": "Diapo " + (i + 1), class: i ? "" : "on", onclick: () => aller(i) })));
    const fleche = sens => el("button", { type: "button", class: "sg-arr sg-arr-" + (sens < 0 ? "g" : "d"), "aria-label": sens < 0 ? "Précédent" : "Suivant", text: sens < 0 ? "‹" : "›",
      onclick: () => aller(ici() + sens) });
    piste.addEventListener("scroll", () => {
      const i = ici();
      [...points.children].forEach((b, j) => b.classList.toggle("on", i === j));
    }, { passive: true });
    return el("section", { id: "sg-pres", class: "sg-pres" }, el("div", { class: "sg-car" }, piste, fleche(-1), fleche(1)), points);
  }

  function invalide() {
    msg("Lien incomplet", "Ce lien de signature n'est pas valide. Vérifiez qu'il est complet (copiez-le en entier depuis le mail), ou appelez Andy au " + TEL + ".");
  }

  function dejaSigne(r) {
    show(
      el("div", { class: "sg-ok" },
        el("h1", { text: "Devis déjà signé" }),
        el("p", { text: "Le devis n° " + r.numero + " a été signé le " + r.signe.le + " par " + r.signe.nom + ". Merci !" })),
      r.iban ? ibanBloc(null, r.numero) : null,
      el("p", { class: "sg-info", text: "Une question ? Appelez Andy au " + TEL + "." }));
  }

  function ibanBloc(acompte, numero) {
    return el("div", { class: "sg-card" },
      el("h2", { text: "Régler l'acompte" }),
      el("p", { class: "sg-info", text: (acompte ? "Acompte de " + pctAc() + " % : " + euro(acompte) + ". " : "") + "Par virement, avec la référence du devis :" }),
      el("div", { class: "sg-iban", text: "IBAN : " + DV.iban }),
      el("div", { class: "sg-iban", text: "Référence : " + numero }),
      el("p", { class: "sg-info", text: "Vous pouvez aussi régler par chèque, espèces ou carte : dites-le à Andy." }));
  }

  function carteOption(o, i) {
    const n = i + 1, plusieurs = DV.options.length > 1;
    const lignes = el("table", { class: "sg-lignes" }, el("tbody", {}, o.lignes.map(l =>
      el("tr", {}, el("td", {}, l.titre, l.detail ? el("small", { text: l.detail }) : null), el("td", { text: euro(l.prix) })))));
    const titre = (plusieurs ? "Option " + n + " · " : "") + o.marque + " " + o.gamme;
    const card = el("section", { class: "sg-card sg-opt" + (plusieurs ? " choix" : "") + (choix === n && plusieurs ? " choisie" : "") },
      el("div", { class: "sg-opt-head" },
        plusieurs
          ? el("label", {}, el("input", { type: "radio", name: "option", value: String(n), checked: choix === n, onchange: () => { choix = n; rendre(true); } }), titre)
          : el("h2", { text: titre }),
        el("div", { class: "sg-total", text: euro(o.total) })),
      lignes,
      el("p", { class: "sg-acompte", text: "Total TTC, fourni, posé et mis en service." + (DV.acompte ? " Acompte de " + pctAc() + " % à la signature : " + euro(o.total * DV.acompte) + " · solde le jour de la mise en service : " + euro(o.total * (1 - DV.acompte)) + "." : "") }));
    if (plusieurs) card.addEventListener("click", e => { if (e.target.tagName !== "INPUT" && choix !== n) { choix = n; rendre(true); } });
    return card;
  }

  // Bouton « Signer » toujours visible en bas de l'écran, caché quand le cadre de signature est à l'écran.
  let obs = null;
  function barreSigner() {
    const b = el("div", { class: "sg-sticky" }, el("button", { type: "button", class: "sg-btn", text: "✍️ Signer le devis",
      onclick: () => document.getElementById("sg-signer").scrollIntoView({ behavior: "smooth", block: "start" }) }));
    requestAnimationFrame(() => {
      const f = document.getElementById("sg-signer");
      if (!f || !("IntersectionObserver" in window)) return;
      if (obs) obs.disconnect();
      obs = new IntersectionObserver(es => b.classList.toggle("cache", es[0].isIntersecting), { threshold: 0.1 });
      obs.observe(f);
    });
    return b;
  }

  let pad = null, nomVal = "", accord = false, avant = false;

  function rendre(garderPad) {
    const ancienne = garderPad && pad ? pad.exporter(true) : null;
    const plusieurs = DV.options.length > 1;
    const err = el("p", { class: "sg-err", role: "alert" });
    const canvas = el("canvas", { "aria-label": "Zone de signature : signez avec le doigt ou la souris" });
    const padBox = el("div", { class: "sg-pad" }, canvas, el("div", { class: "sg-ph", text: "Signez ici avec le doigt" }));
    const btn = el("button", { type: "button", class: "sg-btn", text: "Signer le devis" });
    show(
      el("h1", { class: "sg-h1", text: "Votre devis n° " + DV.numero }),
      el("p", { class: "sg-sub", text: "Émis le " + DV.date + " · valable jusqu'au " + DV.validite + " · " + DV.entreprise.nom + ", climatisation réversible" }),
      presentation(),
      el("section", { class: "sg-card sg-client" }, el("span", { text: "Client" }), el("b", { text: DV.client.nom }), DV.client.adresse ? el("div", { text: DV.client.adresse }) : null),
      plusieurs ? el("p", { class: "sg-info", text: "Deux options vous sont proposées : choisissez celle que vous retenez." }) : null,
      DV.options.map(carteOption),
      el("section", { class: "sg-card sg-info" },
        // Même texte que comprisDevis() dans le script (Code.gs) : changer les deux.
        el("p", {}, el("b", { text: "Compris dans le prix : " }), DV.remplacement
          ? "matériel neuf (fluide R32), fixation des nouvelles unités, raccordement aux liaisons frigorifiques, au câblage et à l'évacuation des condensats déjà en place, raccordement électrique de la climatisation, tirage au vide, contrôle d'étanchéité, mise en service et essais, explication de l'utilisation."
          : "matériel neuf (fluide R32), supports et fixations, liaisons frigorifiques jusqu'à 5 m par unité, goulottes, câbles de liaison, évacuation des condensats, raccordement électrique de la climatisation, tirage au vide, contrôle d'étanchéité, mise en service et essais, explication de l'utilisation."),
        DV.remarques ? el("p", { text: DV.remarques }) : null,
        el("p", { text: "TVA non applicable, art. 293 B du CGI. " + (DV.acompte ? "Règlement : acompte de " + pctAc() + " % à la signature, solde le jour de la mise en service (virement, chèque, espèces ou carte). Pose sous 2 à 3 semaines après réception de l'acompte." : "Règlement par virement, chèque, espèces ou carte. Pose sous 2 à 3 semaines après la signature.") + " Pose garantie 2 ans, matériel garanti par le fabricant." + (DV.copro ? " Sous réserve de l'accord de la copropriété pour les groupes extérieurs." : "") }),
        el("details", { class: "sg-det" }, el("summary", { text: "Droit de rétractation (14 jours)" }),
          el("p", { text: "Vous disposez de 14 jours à compter de la signature pour vous rétracter, sans avoir à donner de motif. Le plus simple : envoyez un e-mail à " + DV.entreprise.mail + " (une phrase claire suffit, par exemple « Je me rétracte du devis n° " + DV.numero + " »). Vous pouvez aussi écrire à " + DV.entreprise.forme + " " + DV.entreprise.nom + ", " + DV.entreprise.adresse + ". Nous vous remboursons tous les paiements reçus au plus tard 14 jours après en avoir été informés. Si vous demandez que les travaux commencent avant la fin de ce délai, vous paierez un montant proportionnel au travail déjà réalisé si vous vous rétractez ensuite. Le formulaire type de rétractation est à la fin du devis PDF joint au mail." }))),
      barreSigner(),
      el("section", { id: "sg-signer", class: "sg-card sg-form" },
        el("h2", { text: "Signer" + (plusieurs ? " l'option choisie" : " le devis") }),
        el("label", { class: "sg-l", for: "sg-nom", text: "Vos nom et prénom" }),
        el("input", { id: "sg-nom", class: "sg-input", autocomplete: "name", maxlength: "80", value: nomVal, oninput: e => { nomVal = e.target.value; } }),
        el("label", { class: "sg-l sg-mt", text: "Votre signature" }),
        padBox,
        el("div", { class: "sg-row" }, el("span", { text: "Avec le doigt sur téléphone, ou la souris." }), el("button", { type: "button", class: "sg-lien", text: "Effacer", onclick: () => pad.effacer() })),
        el("label", { class: "sg-check" }, el("input", { type: "checkbox", checked: accord, onchange: e => { accord = e.target.checked; } }),
          el("span", {}, "J'ai lu le devis et je l'accepte (bon pour accord)" + (plusieurs ? ", pour l'option choisie ci-dessus." : "."))),
        el("label", { class: "sg-check" }, el("input", { type: "checkbox", checked: avant, onchange: e => { avant = e.target.checked; } }),
          el("span", {}, "Je souhaite que les travaux puissent commencer avant la fin du délai de rétractation de 14 jours.",
            el("small", { text: "Facultatif. Sans cette case, la pose aura lieu après ce délai." }))),
        btn, err));
    pad = signaturePad(canvas, padBox, ancienne);
    btn.addEventListener("click", () => signer(btn, err));
  }

  async function signer(btn, err) {
    err.textContent = "";
    const plusieurs = DV.options.length > 1;
    if (plusieurs && !choix) return (err.textContent = "Choisissez d'abord l'option que vous retenez.");
    if (nomVal.trim().length < 3) return (err.textContent = "Indiquez vos nom et prénom.");
    if (!pad.assez()) return (err.textContent = "Tracez votre signature dans le cadre.");
    if (!accord) return (err.textContent = "Cochez la case « J'ai lu le devis et je l'accepte ».");
    btn.disabled = true; btn.textContent = "Signature en cours…";
    const r = await api("signerDevis", { nom: nomVal.trim(), option: choix || 1, signature: pad.exporter(), accepte: true, travauxAvant: avant, ua: navigator.userAgent });
    if (!r.ok) {
      btn.disabled = false; btn.textContent = "Signer le devis";
      if (r.error === "deja_signe") return dejaSigne({ ...DV, signe: r.signe });
      const t = { expire: "Ce devis a expiré : appelez Andy au " + TEL + ".", reseau: "Connexion impossible : vérifiez internet et réessayez.", signature: "La signature n'a pas été reçue correctement : effacez et signez à nouveau.", nom: "Indiquez vos nom et prénom." }[r.error];
      err.textContent = t || "Un souci est survenu. Réessayez, ou appelez Andy au " + TEL + ".";
      return;
    }
    DV.iban = r.iban;
    window.scrollTo(0, 0);
    show(
      el("div", { class: "sg-ok" },
        el("h1", { text: "Merci, votre devis est signé !" }),
        el("p", { text: "Devis n° " + r.numero + " signé le " + r.le + " · " + euro(r.total) + " TTC." }),
        el("p", { text: "Andy vous écrit très vite par mail avec la copie signée et ses prochaines dates de pose." + (r.travauxAvant ? "" : " Comme vous n'avez pas demandé de travaux avant, la pose aura lieu après le délai de rétractation de 14 jours.") })),
      r.iban ? ibanBloc(r.acompte, r.numero) : r.acompte ? el("p", { class: "sg-info", text: "Acompte de " + pctAc() + " % : " + euro(r.acompte) + ". Andy vous indique comment le régler." }) : null,
      el("p", { class: "sg-info", text: "Une question ? Appelez Andy au " + TEL + "." }));
  }

  /* Zone de signature : traits lisses, adaptée à l'écran (Retina) et au doigt. */
  function signaturePad(canvas, box, image) {
    const ctx = canvas.getContext("2d");
    let traits = [], courant = null;
    function taille() {
      const r = canvas.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dessiner();
    }
    function dessiner() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0D1B2A"; ctx.lineWidth = 2.6;
      const w = canvas.getBoundingClientRect().width, hh = canvas.getBoundingClientRect().height;
      for (const t of traits) {
        ctx.beginPath();
        t.forEach((p, i) => { const x = p[0] * w, y = p[1] * hh; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        if (t.length === 1) ctx.lineTo(t[0][0] * w + 0.1, t[0][1] * hh);
        ctx.stroke();
      }
      box.classList.toggle("ecrit", traits.length > 0);
    }
    function point(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    canvas.addEventListener("pointerdown", e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); courant = [point(e)]; traits.push(courant); dessiner(); });
    canvas.addEventListener("pointermove", e => { if (!courant) return; e.preventDefault(); courant.push(point(e)); dessiner(); });
    const fin = () => { courant = null; };
    canvas.addEventListener("pointerup", fin); canvas.addEventListener("pointercancel", fin);
    if (image) traits = image;
    taille();
    return {
      taille,
      effacer() { traits = []; dessiner(); },
      // Assez d'encre : longueur totale des traits ≥ 40 % de la largeur du cadre (un point ou un tiret ne suffit pas).
      assez() {
        let l = 0;
        for (const t of traits) for (let i = 1; i < t.length; i++) l += Math.hypot(t[i][0] - t[i - 1][0], (t[i][1] - t[i - 1][1]) / 3);
        return l >= 0.4;
      },
      // Export : PNG 600×200, trait sombre sur fond transparent (ou les traits bruts pour redessiner).
      exporter(brut) {
        if (brut) return traits;
        const c = document.createElement("canvas"); c.width = 600; c.height = 200;
        const x = c.getContext("2d");
        x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#0D1B2A"; x.lineWidth = 4;
        for (const t of traits) {
          x.beginPath();
          t.forEach((p, i) => { if (i === 0) x.moveTo(p[0] * 600, p[1] * 200); else x.lineTo(p[0] * 600, p[1] * 200); });
          if (t.length === 1) x.lineTo(t[0][0] * 600 + 0.5, t[0][1] * 200);
          x.stroke();
        }
        return c.toDataURL("image/png");
      }
    };
  }

  /* Données fictives pour vérifier la page en local (jamais sur thermaz.fr). */
  function demo(action, data) {
    const deux = q.get("demo") === "2";
    const base = {
      ok: true, numero: "D-2026-012", date: "07/11/2026", validite: "22/11/2026", expire: false, acompte: 0.4, validiteJours: 15, signe: null, iban: "",
      client: { nom: "M. Client Exemple", adresse: "1 rue de l'Exemple, 13300 Salon-de-Provence" }, remarques: "Séjour : mono-split 3,5 kW. Chambres : bi-split 2 + 2 kW.", copro: false,
      entreprise: { nom: "Thermaz", forme: "Entreprise individuelle", adresse: "46 rue Maréchal Joffre, 13300 Salon-de-Provence", siren: "105 451 199", tel: TEL, mail: "thermaz.fr@gmail.com" },
      options: [
        { marque: "Daikin", gamme: "Perfera", total: 6252, lignes: [{ titre: "Mono-split Daikin Perfera", detail: "1 unité intérieure murale 3,5 kW + 1 groupe extérieur assorti", prix: 2290 }, { titre: "Bi-split Daikin Perfera", detail: "1 groupe extérieur + 2 unités intérieures murales (2 kW + 2 kW)", prix: 3962 }] }
      ]
    };
    if (deux) base.options.push({ marque: "Daikin", gamme: "Sensira", total: 5209, lignes: [{ titre: "Mono-split Daikin Sensira", detail: "1 unité intérieure murale 3,5 kW + 1 groupe extérieur assorti", prix: 1890 }, { titre: "Bi-split Daikin Sensira", detail: "1 groupe extérieur + 2 unités intérieures murales (2 kW + 2 kW)", prix: 3319 }] });
    // ?demo=sans : devis sans acompte (case décochée dans l'espace admin), avec une dépose détaillée.
    const sans = q.get("demo") === "sans";
    if (sans) Object.assign(base, { acompte: 0, sansAcompte: true, remplacement: true, remarques: "", options: [{ marque: "Daikin", gamme: "Sensira", total: 1284, lignes: [
      { titre: "Mono-split Daikin Sensira", detail: "1 unité intérieure murale 2,5 kW + 1 groupe extérieur assorti", prix: 1195 },
      { titre: "Dépose de l'ancienne climatisation", detail: "Récupération du fluide frigorigène, démontage de l'unité intérieure et du groupe extérieur, évacuation de l'ancien matériel en filière de recyclage", prix: 89 }] }] });
    return new Promise(res => setTimeout(() => {
      if (action === "devisPublic") return res(base);
      const o = base.options[(data.option || 1) - 1];
      res({ ok: true, numero: base.numero, le: "07/11/2026 à 23:10", total: o.total, acompte: sans ? 0 : Math.round(o.total * 40) / 100, iban: sans ? "" : "FR76 0000 0000 0000 0000 0000 000", travauxAvant: !!data.travauxAvant });
    }, 300));
  }

  window.addEventListener("resize", () => { if (pad) pad.taille(); });
  init();
})();
