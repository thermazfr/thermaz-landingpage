// Prévient Bing, Yandex, Seznam… (protocole IndexNow) des pages du site après chaque mise en ligne.
import { readFile } from "node:fs/promises";
const KEY = "2cbdbd34861574019919b1a4ccb9b175";
const xml = await readFile("sitemap.xml", "utf8");
const urlList = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
const r = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "thermaz.fr", key: KEY, keyLocation: `https://thermaz.fr/${KEY}.txt`, urlList })
});
console.log("IndexNow :", r.status, urlList.length, "pages envoyées");
if (r.status >= 400) process.exit(1);
