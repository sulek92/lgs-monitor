// Zewnętrzna sonda lodzkagaleriasztuki.pl (GitHub Actions, bez sekretów i zależności).
// Błąd dowolnej kontroli kończy proces kodem 1 → GitHub wysyła e-mail o nieudanym przebiegu.
import { connect } from "node:tls";

const BAZA = "https://lodzkagaleriasztuki.pl";
const WYDAWCA = "pub-6935008490668870";
const tryb = process.argv.includes("--dns") ? "dns" : "http";

async function pobierz(sciezka, { limitMs = 8000 } = {}) {
  const start = Date.now();
  const r = await fetch(BAZA + sciezka, {
    redirect: "manual",
    signal: AbortSignal.timeout(limitMs),
    headers: { "user-agent": "lgs-monitor (+https://github.com/sulek92/lgs-monitor)" },
  });
  return { status: r.status, tekst: await r.text(), ms: Date.now() - start, naglowki: r.headers };
}

function wymagaj(warunek, opis) {
  if (!warunek) throw new Error(opis);
}

const kontroleHttp = {
  async health() {
    const r = await pobierz("/api/health", { limitMs: 5000 });
    wymagaj(r.status === 200, `HTTP ${r.status}`);
    wymagaj(r.tekst.trim() === '{"status":"ok","db":"up"}', `treść: ${r.tekst.slice(0, 80)}`);
    return `${r.ms} ms`;
  },
  async glowna() {
    for (const [sciezka, lang] of [["/", "pl"], ["/en", "en"]]) {
      const r = await pobierz(sciezka);
      wymagaj(r.status === 200, `${sciezka}: HTTP ${r.status}`);
      wymagaj(new RegExp(`<html[^>]*lang="${lang}"`).test(r.tekst), `${sciezka}: brak lang=${lang}`);
      wymagaj(r.tekst.includes('id="tresc"'), `${sciezka}: brak treści strony`);
    }
    return "PL i EN";
  },
  async mapaIArtykul() {
    const mapa = await pobierz("/sitemap.xml");
    wymagaj(mapa.status === 200, `sitemap HTTP ${mapa.status}`);
    const adresy = [...mapa.tekst.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    wymagaj(adresy.length >= 100, `sitemap: tylko ${adresy.length} adresów`);
    const artykul = adresy.find((a) => /\/magazyn\/[^/]+$/.test(a) && !a.includes("/demo/"));
    wymagaj(artykul, "sitemap: brak artykułu Magazynu");
    const r = await pobierz(new URL(artykul).pathname);
    wymagaj(r.status === 200, `artykuł HTTP ${r.status}`);
    wymagaj(r.tekst.includes("application/ld+json"), "artykuł bez JSON-LD");
    return `${adresy.length} adresów`;
  },
  async robotsIAds() {
    const robots = await pobierz("/robots.txt");
    wymagaj(robots.status === 200 && /Sitemap:/i.test(robots.tekst), "robots.txt bez Sitemap");
    const ads = await pobierz("/ads.txt");
    wymagaj(ads.status === 200 && ads.tekst.includes(WYDAWCA), "ads.txt bez rekordu wydawcy");
    return "ok";
  },
  async demo() {
    const r = await pobierz("/demo");
    wymagaj(r.status === 200, `HTTP ${r.status}`);
    return "ok";
  },
  certyfikat() {
    return new Promise((ok, blad) => {
      const s = connect({ host: "lodzkagaleriasztuki.pl", port: 443, servername: "lodzkagaleriasztuki.pl" }, () => {
        const dni = (new Date(s.getPeerCertificate().valid_to).getTime() - Date.now()) / 86400000;
        s.end();
        dni > 14 ? ok(`${Math.floor(dni)} dni`) : blad(new Error(`certyfikat wygasa za ${dni.toFixed(1)} dni`));
      });
      s.setTimeout(8000, () => s.destroy(new Error("TLS: przekroczony czas")));
      s.on("error", blad);
    });
  },
};

async function txt(nazwa) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${nazwa}&type=TXT`, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(8000),
  });
  const d = await r.json();
  return (d.Answer ?? []).map((a) => a.data.replace(/"\s*"/g, "").replace(/"/g, ""));
}

const kontroleDns = {
  async spf() {
    wymagaj((await txt("lodzkagaleriasztuki.pl")).some((t) => t.startsWith("v=spf1")), "brak SPF");
    return "ok";
  },
  async dmarc() {
    wymagaj((await txt("_dmarc.lodzkagaleriasztuki.pl")).some((t) => t.startsWith("v=DMARC1")), "brak DMARC");
    return "ok";
  },
  async dkimBrevo() {
    const r = await fetch("https://cloudflare-dns.com/dns-query?name=brevo1._domainkey.lodzkagaleriasztuki.pl&type=CNAME", {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(8000),
    });
    wymagaj(((await r.json()).Answer ?? []).length > 0, "brak DKIM brevo1");
    return "ok";
  },
};

const kontrole = tryb === "dns" ? kontroleDns : kontroleHttp;
let bledy = 0;
for (const [nazwa, kontrola] of Object.entries(kontrole)) {
  let wynik;
  for (let proba = 1; proba <= 2; proba++) {
    try {
      wynik = { ok: true, opis: await kontrola() };
      break;
    } catch (e) {
      wynik = { ok: false, opis: e.message };
      // Jedno ponowienie po 20 s: pojedynczy błąd sieci runnera nie jest awarią.
      if (proba === 1) await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  console.log(`${wynik.ok ? "✓" : "✗"} ${nazwa}: ${wynik.opis}`);
  if (!wynik.ok) bledy++;
}
if (bledy) {
  console.error(`Awaria: ${bledy} kontrol(e) nie przeszły.`);
  process.exit(1);
}
