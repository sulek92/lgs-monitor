# lgs-monitor

Zewnętrzna sonda [lodzkagaleriasztuki.pl](https://lodzkagaleriasztuki.pl), niezależna od
serwera galerii. Wewnętrzny monitor działa na tym samym VPS i nie zaalarmuje przy
całkowitej awarii serwera lub jego łącza — to repo tak.

- **Co 15 minut:** `/api/health` (dokładna odpowiedź), strona główna PL/EN (`lang`, treść),
  mapa witryny (≥100 adresów), artykuł Magazynu z JSON-LD, `robots.txt`, `ads.txt`,
  prezentacja `/demo` i ważność certyfikatu (>14 dni).
- **Codziennie:** rekordy DNS poczty (SPF, DMARC, DKIM Brevo).
- **Alarm:** nieudany przebieg → e-mail od GitHub do właściciela repozytorium
  (Settings → Notifications → Actions: „Send notifications for failed workflows only”).
- **Bez sekretów:** wyłącznie publiczne adresy; kontrola ponawia się raz po 20 s.

Ręczne uruchomienie: zakładka Actions → „Monitor lodzkagaleriasztuki.pl” → Run workflow.
Lokalnie: `node sprawdz.mjs` (HTTP) albo `node sprawdz.mjs --dns`.
