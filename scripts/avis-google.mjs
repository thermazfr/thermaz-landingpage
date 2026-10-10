// Récupère la note et les avis de la fiche Google Thermaz et les écrit dans data/avis-google.json.
// Lancé chaque nuit par .github/workflows/avis-google.yml. Rien à modifier ici.
import { writeFile, mkdir } from "node:fs/promises";

const key = process.env.GOOGLE_PLACES_API_KEY;
const NAME = "thermaz"; // la fiche trouvée doit contenir ce mot
const SEARCH = process.env.GOOGLE_PLACE_QUERY || "Thermaz climatisation Salon-de-Provence";
if (!key) {
  console.error("Il manque le secret GOOGLE_PLACES_API_KEY dans GitHub.");
  process.exit(1);
}
const H = { "X-Goog-Api-Key": key, "Content-Type": "application/json" };

// 1. Trouver la fiche (si l'identifiant n'est pas fourni)
let placeId = process.env.GOOGLE_PLACE_ID;
if (!placeId) {
  const queries = [SEARCH, "Thermaz", "Thermaz Salon-de-Provence", "Thermaz climatisation", "Thermaz climatisation plomberie"];
  const seen = [];
  for (const q of queries) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { ...H, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.websiteUri" },
      body: JSON.stringify({
        textQuery: q, languageCode: "fr", regionCode: "FR",
        locationBias: { circle: { center: { latitude: 43.6403, longitude: 5.0973 }, radius: 50000 } }
      })
    });
    if (!r.ok) { console.error("Erreur Google (recherche) :", r.status, await r.text()); process.exit(1); }
    const places = (await r.json()).places || [];
    places.forEach(p => seen.push(`${p.displayName?.text} | ${p.formattedAddress ?? "sans adresse"} | ${p.websiteUri ?? "-"}`));
    const found = places.find(p =>
      (p.displayName?.text || "").toLowerCase().includes(NAME) || (p.websiteUri || "").toLowerCase().includes("thermaz.fr"));
    if (found) {
      placeId = found.id;
      console.log(`Fiche trouvée avec "${q}" : ${found.displayName.text} (${placeId})`);
      console.log("Astuce : ajoute ce Place ID dans le secret GOOGLE_PLACE_ID pour aller plus vite.");
      break;
    }
  }
  if (!placeId) {
    console.error(`Aucune fiche "${NAME}" trouvée. Résultats vus :`);
    [...new Set(seen)].slice(0, 25).forEach(l => console.error("  - " + l));
    console.error("Solution : renseigner le secret GOOGLE_PLACE_ID (code ChIJ... de la fiche).");
    process.exit(1);
  }
}

// 2. Lire la note et les avis
const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=fr`, {
  headers: { ...H, "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,googleMapsUri,reviews" }
});
if (!res.ok) { console.error("Erreur Google (avis) :", res.status, await res.text()); process.exit(1); }
const p = await res.json();

const out = {
  placeId: p.id ?? placeId,
  name: p.displayName?.text ?? "Thermaz",
  rating: p.rating ?? null,
  count: p.userRatingCount ?? 0,
  url: p.googleMapsUri ?? null,
  updated: new Date().toISOString(),
  reviews: (p.reviews ?? []).map(r => ({
    name: r.authorAttribution?.displayName ?? "Client Google",
    stars: r.rating ?? 5,
    when: r.relativePublishTimeDescription ?? "",
    text: (r.originalText?.text ?? r.text?.text ?? "").trim()
  }))
};

await mkdir("data", { recursive: true });
await writeFile("data/avis-google.json", JSON.stringify(out, null, 2) + "\n");
console.log(`OK : ${out.rating}/5, ${out.count} avis, ${out.reviews.length} affichés.`);
