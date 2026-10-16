# ChainTrack: wdrożenie dla początkujących

Status: instrukcja do wykonania
Ostatnia aktualizacja: 2026-09-28

## Jak czytać ten dokument

Każdy krok ma właściciela:

- **[CZŁOWIEK]** - wymaga założenia konta, kliknięcia w panelu, decyzji biznesowej, potwierdzenia e-maila albo użycia sekretu. Agent AI może przygotować instrukcję, ale nie powinien wykonywać tego sam.
- **[AGENT AI]** - agent może zmienić pliki w repozytorium, uruchomić polecenia, przygotować konfigurację, testy i dokumentację. Człowiek zatwierdza diff i wynik.
- **[WSPÓLNIE]** - agent przygotowuje zmianę lub test, a człowiek wykonuje nieodwracalną operację albo sprawdza wynik na prawdziwym koncie/domenie.

Nie wklejaj haseł, tokenów ani kluczy do rozmowy z agentem. Sekret wpisz bezpośrednio w terminalu lub panelu dostawcy. Przed wdrożeniem utwórz kopię planu i pracuj na osobnej gałęzi Git.

## Cel i decyzja techniczna

ChainTrack będzie uruchomiony jako aplikacja SSR na **Cloudflare Workers**. Astro generuje serwerowy Worker, a Supabase obsługuje logowanie i bazę danych. Pierwszym hostem będzie adres `workers.dev`; własna domena jest opcjonalna i nie blokuje MVP. Cloudflare przeznacza `workers.dev` głównie dla projektów hobbystycznych i niekrytycznych biznesowo, dlatego przed uznaniem aplikacji za krytyczną usługę należy ponownie ocenić własną domenę lub route. Cloudflare Pages jest w tym planie tylko historyczną nazwą i nie jest docelową platformą.

Na początku wdrażamy tylko istniejący przepływ logowania. Integracja z dostawcą aktywności jest późniejszym etapem i nie może blokować pierwszego wdrożenia.

## Co trzeba przygotować przed startem

1. **[CZŁOWIEK] Zainstaluj narzędzia.** Zainstaluj Node.js `22.14.0` (wersję wskazaną w `.nvmrc`), npm, Git i Docker Desktop. Docker jest potrzebny tylko do lokalnego Supabase. Po instalacji sprawdź:

```bash
node --version
npm --version
git --version
docker --version
```

2. **[CZŁOWIEK] Załóż konto Cloudflare.** Wejdź na `dash.cloudflare.com`, utwórz konto, potwierdź adres e-mail i dodaj metodę płatności, jeśli Cloudflare poprosi o nią przy Workers. Zapisz nazwę konta i Account ID. Account ID znajdziesz w panelu konta, nie w ustawieniach konkretnego Workera.

3. **[CZŁOWIEK] Załóż konto Supabase.** Wejdź na `supabase.com`, utwórz organizację i potwierdź e-mail. W MVP tworzymy jeden projekt Supabase dla produkcji i używamy go w środowisku produkcyjnym. Testy lokalne wykorzystują osobne dane lokalne, nie wspólne dane produkcyjne.

4. **[CZŁOWIEK] Przygotuj repozytorium i dostęp.** Upewnij się, że repozytorium jest na GitHubie, że masz uprawnienia administratora do repozytorium i ochrony gałęzi, oraz że osoba wdrażająca ma dostęp do Cloudflare i projektu Supabase. Włącz 2FA w GitHubie, Cloudflare i Supabase.

5. **[CZŁOWIEK] Ustal nazwy i właścicieli.** Zapisz osobę zatwierdzającą produkcję, osobę z dostępem do Cloudflare, osobę z dostępem do Supabase i osobę odpowiedzialną za rollback. W MVP adresem aplikacji jest `workers.dev`; własną domenę można wybrać później. Nie ma osobnego stagingu.

## Etap 1: decyzje przed konfiguracją

- [x] **[CZŁOWIEK] Wybierz model środowisk.** W MVP przyjmujemy najprostszy wariant: tylko środowisko produkcyjne i testy lokalne. Nie dodajemy osobnego stagingu na start, bo to zwiększa konfigurację i nie jest potrzebne do pierwszego uruchomienia. Lokalna weryfikacja i ręczne testy na produkcyjnym Workera są wystarczające na etapie MVP.

- [x] **[CZŁOWIEK] Wybierz właściciela wdrożeń.** Przyjmujemy **Cloudflare Workers Builds** jako jedyny system publikacji. Nie uruchamiamy równolegle GitHub Actions, aby nie mieć dwóch niezależnych mechanizmów deployu i uniknąć nadpisywania nowych wersji.

- [x] **[CZŁOWIEK] Zdecyduj, kiedy potrzebna jest zgoda.** Produkcja, zmiana sekretów, migracje bazy i zmiany RLS wymagają ręcznej akceptacji. Właścicielem akceptacji jest właściciel projektu: **Mateusz Pindara** (`mateusz.pindara@omc.com`).

- [x] **[AGENT AI] Zaktualizuj dokumentację decyzji.** Właściciel Cloudflare i właściciel Supabase to ten sam użytkownik: **Mateusz Pindara** (`mateusz.pindara@omc.com`). Dokumentacja będzie odzwierciedlać model MVP bez stagingu, nazwę `chaintrack-production` oraz deployment przez Cloudflare Workers Builds.

## Etap 2: przygotowanie projektu lokalnie

- [x] **[CZŁOWIEK] Pobierz projekt i zainstaluj zależności.** `npm install` zakończył się powodzeniem, a `git status` potwierdził, że `.dev.vars` i `node_modules/` nie są śledzone. npm zgłosił ostrzeżenia o wymaganiach wersji Node dla kilku zależności, ale nie zgłosił podatności.

```bash
npm install
```

Nie dodawaj `.env`, `.dev.vars` ani tokenów do Git. Sprawdź `git status`, aby upewnić się, że lokalne sekrety są ignorowane.

- [x] **[CZŁOWIEK] Utwórz lokalne sekrety.** Potwierdzono, że `.dev.vars` zawiera lokalny `SUPABASE_URL` oraz klucz `anon`/publishable, a nie `service_role`. Plik jest ignorowany przez Git. Plik `.env.example` jest obecnie usunięty w istniejących zmianach Git i nie był odtwarzany.

- [x] **[AGENT AI] Uporządkuj skrypty projektu.** Dodano skrypty dla `astro check`, `wrangler types` i walidacji konfiguracji. Skrypty buildu, preview i smoke testu już istniały. `.dev.vars` pozostaje ignorowany przez Git.

- [x] **[AGENT AI] Skonfiguruj Workera.** Zmieniono nazwę Workera na `chaintrack-production`. Zachowano entrypoint Astro, `nodejs_compat`, katalog `./dist`, obsługę 404 i observability. Konfiguracja domeny pozostaje do wykonania po jej wyborze.

- [x] **[WSPÓLNIE] Sprawdź konfigurację.** `wrangler types`, `npx astro check` i build przeszły. Lint powtórzę po dodaniu wygenerowanego pliku typów do `.gitignore`. Do konfiguracji nie dodano sekretów; nazwa Workera to `chaintrack-production`.

## Etap 3: przygotowanie do konfiguracji dostawców

Etap 3 kończy konfigurację lokalną i decyzje projektowe. Produkcyjny projekt Supabase, sekrety i integracja GitHub są wykonywane w etapach 5–7. Własna domena nie jest wymagana; w MVP używamy adresu `workers.dev`. Nie ma osobnego stagingu.

## Etap 4: lokalny Wrangler i walidacja aplikacji

- [ ] **[AGENT AI] Sprawdź lokalne narzędzia.** Sprawdź `node --version`, `npm --version` i `npx wrangler --version`; Wrangler jest już zainstalowany jako zależność projektu. Jeśli brakuje zależności lub Node nie ma wersji `22.14.0`, zgłoś dokładny problem i poproś człowieka tylko o brakujące działanie. Logowanie do Cloudflare wykonuj dopiero w etapie 5.

- [x] **[AGENT AI] Wykonaj lokalną kontrolę jakości.** `npm run lint`, `npx astro check`, `npm run wrangler:types` i `npm run build` przeszły. Preview uruchomił się na `http://localhost:4321`; smoke test został uruchomiony, ale wymaga działającego lokalnego Supabase.

```bash
npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

- [x] **[WSPÓLNIE] Zinterpretuj wynik.** Kontrole kodu, build i dostępność preview przeszły. Po poprawieniu `.dev.vars` smoke test przeszedł **8/8 kroków**: strona główna, ochrona anonimowego `/dashboard`, signup, błędne i poprawne logowanie, dashboard po zalogowaniu oraz signout. Przyczyną wcześniejszego `email rate limit exceeded` była nieprawidłowa konfiguracja środowiska Supabase. Dla local dev używaj `.dev.vars` i nie mieszaj go z `.env`.

## Etap 5: Cloudflare i docelowy adres aplikacji

- [ ] **[AGENT AI] Zrób lokalny preflight Cloudflare.** Sprawdź `npx wrangler --version`, konfigurację `wrangler.jsonc` i zgodność jej nazwy `chaintrack-production`, entrypointu Astro, `nodejs_compat`, assets, obsługi 404 oraz observability. Uruchom `npx wrangler whoami`, aby sprawdzić, czy Wrangler jest zalogowany i do którego konta ma dostęp. Nie wyświetlaj ani nie zapisuj tokenów.

- [ ] **[CZŁOWIEK] Zaloguj Wranglera tylko jeśli trzeba.** Jeśli `npx wrangler whoami` pokaże brak autoryzacji lub niewłaściwe konto, agent zatrzymuje operacje na koncie i prosi o wykonanie `npx wrangler login` w lokalnym terminalu oraz wybranie właściwego konta. Nie prosi o token, hasło ani skopiowanie danych uwierzytelniających do rozmowy. Po zalogowaniu agent ponownie uruchamia `npx wrangler whoami` i raportuje nazwę/Account ID sprawdzonego konta.

- [ ] **[AGENT AI] Sprawdź dostępność `workers.dev`.** Potwierdź, że konto ma skonfigurowaną i włączoną subdomenę `workers.dev`. Sprawdź w Cloudflare Dashboard → **Workers & Pages** nazwę subdomeny konta oraz czy trasa `workers.dev` jest aktywna. `wrangler whoami` potwierdza konto, ale nie musi zwracać jego subdomeny; jeśli agent nie może jej odczytać, poproś człowieka tylko o podanie widocznej nazwy subdomeny lub potwierdzenie ustawienia w panelu. Jeśli subdomena nie jest skonfigurowana, poproś człowieka o jej jednorazowe włączenie. Nie wymagaj własnej domeny ani strefy DNS.

- [ ] **[AGENT AI] Potwierdź adres Workera.** Adres ma format `https://chaintrack-production.<subdomena-konta>.workers.dev`. Użyj nazwy Workera z `wrangler.jsonc` i subdomeny potwierdzonej w panelu. Zapisz ten URL jako adres MVP; jeśli Cloudflare pokazuje inny URL po utworzeniu Workera, użyj adresu zwróconego przez Cloudflare.

- [ ] **[AGENT AI] Utrzymaj konfigurację bez własnej domeny.** Pozostaw `workers_dev: true` w `wrangler.jsonc` i nie dodawaj `route`, `routes` ani `custom_domain` dla MVP. Dzięki temu publikacja nie wymaga własnej strefy DNS ani ręcznego tworzenia certyfikatu. Pokaż diff, jeśli konfiguracja wymaga poprawy, ale nie uruchamiaj deployu.

- [ ] **[AGENT AI] Zweryfikuj konfigurację `workers.dev`.** Uruchom `npm run wrangler:types`, `npm run build` i `npx wrangler deploy --dry-run`. Potwierdź, że `workers_dev` jest włączone i konfiguracja nie wymaga własnej domeny. Raportuj wynik; dry-run nie publikuje Workera.

- [ ] **[CZŁOWIEK] Zatwierdź adres i moment publikacji.** Potwierdź adres `workers.dev` oraz diff konfiguracji. Osobna zgoda jest wymagana przed scaleniem lub wypchnięciem zmiany, która uruchomi pierwszy produkcyjny build Workers Builds. Samo przygotowanie konfiguracji nie oznacza zgody na publikację.

- [ ] **[WSPÓLNIE] Przekaż URL do etapu Supabase.** Użyj dokładnego adresu `workers.dev` jako źródła prawdy dla Site URL, redirectów Auth i testu produkcyjnego. Brak własnej domeny nie blokuje kolejnego etapu.

## Etap 6: Supabase i sekrety aplikacji

- [ ] **[CZŁOWIEK] Utwórz projekt Supabase produkcyjny.** Utwórz projekt `chaintrack-production`, ustaw silne hasło bazy i wybierz region blisko użytkowników. MVP nie ma osobnego stagingu.

- [ ] **[CZŁOWIEK] Pobierz wartości aplikacyjne.** Z **Project Settings → API** pobierz wyłącznie Project URL oraz klucz `anon`/publishable. Nie używaj `service_role`. Wartości przechowuj w menedżerze haseł.

- [ ] **[CZŁOWIEK] Skonfiguruj Auth.** W **Authentication → URL Configuration** ustaw Site URL na adres `workers.dev` z etapu 5 i dodaj dokładne redirect URLs dla `workers.dev` oraz localhosta. Pozostaw potwierdzenie e-mail włączone; SMTP skonfiguruj przed realnym użyciem. Po późniejszej zmianie hosta zaktualizuj Site URL i redirect URLs.

- [ ] **[AGENT AI] Zweryfikuj kod auth.** Sprawdź `src/lib/supabase.ts`, `src/middleware.ts` i `src/pages/api/auth/` pod kątem walidacji, cookies, redirectów i ochrony `/dashboard`. Agent nie odczytuje wartości sekretów.

- [ ] **[CZŁOWIEK] Dodaj sekrety do Workera.** Ustaw `SUPABASE_URL`, `SUPABASE_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` i `STRAVA_TOKEN_ENCRYPTION_KEY` w produkcyjnym Workerze przez panel Cloudflare albo `npx wrangler secret put`. Ustaw Strava redirect URI na dokładny publiczny URL Workera z `/api/strava/callback`; wprowadź wartości bezpośrednio, bez zapisywania ich w repozytorium ani rozmowie.

## Etap 7: GitHub i Workers Builds

- [ ] **[CZŁOWIEK] Przygotuj repozytorium GitHub.** Upewnij się, że kod jest w docelowym repozytorium, gałąź produkcyjna jest ustalona, 2FA jest włączone, a ochrona gałęzi wymaga przejścia lokalnej kontroli jakości. Nie dodawaj sekretów do GitHub.

- [ ] **[CZŁOWIEK] Wybierz system publikacji.** Pozostaje jeden system: **Cloudflare Workers Builds**. Nie dodawaj równolegle GitHub Actions ani ręcznego deployu jako stałej ścieżki.

- [ ] **[CZŁOWIEK] Połącz Cloudflare Workers Builds z GitHubem.** Wybierz repozytorium, gałąź produkcyjną, komendę buildu `npm run build` i konfigurację Workera. Nadaj integracji minimalne uprawnienia. Nie uruchamiaj ani nie zatwierdzaj pierwszego produkcyjnego builda przed zgodą właściciela z etapu 5; jeśli samo połączenie integracji natychmiast publikuje, odłóż je do etapu 8. Token Cloudflare twórz tylko wtedy, gdy wybrany wariant integracji go wymaga, i przechowuj go poza repozytorium.

- [ ] **[AGENT AI] Przygotuj i sprawdź commit wdrożeniowy.** Zweryfikuj diff, uruchom `npm install`, `npm run lint`, `npx astro check`, `npm run wrangler:types`, `npm run build` i lokalny smoke test. Agent nie zatwierdza publikacji produkcyjnej.

## Etap 8: pierwszy deploy, test produkcyjny i rollback

- [ ] **[CZŁOWIEK] Potwierdź gotowość do publikacji.** Sprawdź, że projekt Supabase, adres `workers.dev`, sekrety Workera i połączenie Workers Builds są ustawione. Właściciel projektu, Mateusz Pindara, zatwierdza pierwszy deploy.

- [ ] **[WSPÓLNIE] Wdróż pierwszą wersję.** Cloudflare Workers Builds wykonuje build i publikację z ustalonej gałęzi. Nie uruchamiaj równolegle `npx wrangler deploy`; ręczny Wrangler zostaje procedurą awaryjną po osobnej akceptacji.

- [ ] **[WSPÓLNIE] Potwierdź adres `workers.dev` po buildzie.** Sprawdź, czy Workers Builds opublikował `chaintrack-production` pod adresem `workers.dev`, a następnie zweryfikuj odpowiedź strony po HTTPS. Nie konfiguruj własnego DNS ani certyfikatu TLS dla tego adresu.

- [ ] **[WSPÓLNIE] Wykonaj test po publikacji.** Agent uruchamia smoke test na publicznym URL. Człowiek testuje rejestrację, e-mail, logowanie, złe hasło, ochronę dashboardu, odświeżenie sesji, cookies, 404 i wylogowanie.

- [ ] **[CZŁOWIEK] Ustal kanał alarmowy i właściciela rollbacku.** Właścicielem rollbacku jest Mateusz Pindara, z reakcją w ciągu 1 godziny roboczej. Zapisz kanał alarmowy i zakres godzin.

- [ ] **[AGENT AI] Przygotuj procedurę rollbacku.** Agent może opisać, jak znaleźć poprzednią wersję w Cloudflare, jak ją ponownie opublikować, jak sprawdzić zgodność migracji i jakie endpointy przetestować po rollbacku. Nie powinien samodzielnie cofać produkcji.

- [ ] **[CZŁOWIEK] Wykonaj rollback tylko po decyzji właściciela.** W Cloudflare sprawdź deployment history i przywróć ostatnią znaną dobrą wersję. Następnie sprawdź stronę główną, signin, ochronę dashboardu, signout, cookies i logi.

- [ ] **[AGENT AI] Pomóż analizować logi.** Agent może analizować zanonimizowane logi, błędy buildu i wyniki testów. Nigdy nie przekazuj mu haseł, tokenów, cookies, pełnych payloadów dostawcy ani danych użytkowników.

## Integracja Strava

- **[CZŁOWIEK] Skonfiguruj aplikację Strava dla produkcji.** Ustaw publiczny host Workera jako callback domain oraz `https://<worker-host>/api/strava/callback` jako redirect URI. Przyznaj wymagane scope'y `activity:read_all` i `profile:read_all`.
- **[CZŁOWIEK] Zweryfikuj połączenie i import.** Po ustawieniu wszystkich sześciu sekretów autoryzuj konto Strava, uruchom początkowy import z dashboardu i sprawdź bike-linked history oraz brak ujawnionych tokenów w URL, odpowiedzi, stronie i logach.

## Bramki odbioru

### Lokalnie

- [ ] **[WSPÓLNIE]** `npm install` lub `npm ci` przechodzi na Node `22.14.0`.
- [ ] **[AGENT AI]** `npm run lint`, `npx astro check`, `wrangler types` i `npm run build` przechodzą.
- [ ] **[WSPÓLNIE]** Preview działa na Cloudflare runtime i `npm run smoke` przechodzi.
- [ ] **[CZŁOWIEK]** Sekrety nie są śledzone przez Git i nie pojawiają się w logach.

### Produkcja

- [ ] **[CZŁOWIEK]** Istnieje osobny projekt Supabase i sekrety środowiska produkcyjnego.
- [ ] **[WSPÓLNIE]** Działa adres HTTPS `workers.dev`, auth, cookies, e-mail, 404 i ochrona dashboardu.
- [ ] **[AGENT AI]** Local smoke test i deploy produkcyjny przechodzą bez błędów.

### Po wdrożeniu

- [ ] **[CZŁOWIEK]** Jest zgoda właściciela po udanych testach lokalnych i walidacji produkcyjnej.
- [ ] **[WSPÓLNIE]** Działa adres `workers.dev`, TLS, redirecty Supabase i pełny test konta.
- [ ] **[CZŁOWIEK]** Znana jest poprzednia dobra wersja i osoba od rollbacku.

## Co może zrobić agent, a czego nie powinien

Agent AI może: edytować konfigurację i dokumentację, pisać skrypty i testy, uruchamiać lint/build/check/smoke, analizować błędy oraz przygotować dokładne komendy deployu.

Agent AI nie powinien: zakładać kont za człowieka, akceptować regulaminów, wybierać planu płatnego, tworzyć ani przechowywać sekretów, wpisywać tokenów do plików, dodawać klucza `service_role`, zmieniać DNS bez zatwierdzenia, wdrażać produkcji ani wykonywać rollbacku bez wyraźnej zgody.

## Ustalenia do uzupełnienia przez człowieka

- [x] Host MVP: `workers.dev` (własna domena opcjonalna, poza zakresem pierwszego wdrożenia)
- [x] Domena stagingowa: brak w MVP (bez osobnego stagingu)
- [x] Nazwa Workera staging: brak (MVP bez stagingu)
- [x] Nazwa Workera production: `chaintrack-production`
- [x] Właściciel Cloudflare: Mateusz Pindara (`mateusz.pindara@omc.com`)
- [x] Właściciel Supabase: Mateusz Pindara (`mateusz.pindara@omc.com`)
- [x] Właściciel akceptacji produkcji: Mateusz Pindara
- [x] Właściciel rollbacku i oczekiwany czas reakcji: Mateusz Pindara, odpowiedź w ciągu 1 godziny roboczej
- [x] Wybrany system deploymentu: Cloudflare Workers Builds
- [x] Dostawca aktywności: jeszcze nie wybrano / nie jest to blocker pierwszego wdrożenia

## Powiązane pliki

- `wrangler.jsonc` - Worker, środowiska, assets, kompatybilność i observability.
- `astro.config.mjs` - SSR Astro, adapter Cloudflare i server-only env.
- `package.json` - skrypty instalacji, walidacji, buildu, preview i smoke testu.
- `src/lib/supabase.ts` - klient Supabase i cookies.
- `src/middleware.ts` - sesja i ochrona tras.
- `src/pages/api/auth/` - serwerowe endpointy auth.
- `scripts/smoke.mjs` - szybki test całego przepływu logowania.
