# Lokalny start ChainTrack po restarcie

Ten runbook uruchamia lokalny Supabase, buduje aplikację Astro z sekretami z `.dev.vars`, startuje preview Cloudflare i wykonuje smoke test auth.

## Warunki wstępne

- Katalog roboczy: `/Users/mateuszpindara/Projects/ChainTrack`
- Node.js: wersja z `.nvmrc` (`22.14.0`)
- Docker Desktop: uruchomiony
- Zależności npm: zainstalowane
- `.dev.vars`: istnieje lokalnie, jest ignorowany przez Git i zawiera:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<lokalny klucz anon/publishable>
```

Nie wpisuj do repozytorium haseł, tokenów ani klucza `service_role`. Nie wyświetlaj wartości `.dev.vars` w terminalu ani w odpowiedzi dla użytkownika.

## Procedura startowa

W Terminalu 1, z katalogu projektu:

```bash
cd /Users/mateuszpindara/Projects/ChainTrack
node --version
npm install
npx supabase start
npx supabase status
```

`npx supabase status` musi pokazać działający lokalny API pod `http://127.0.0.1:54321`. Jeżeli Supabase nie startuje, sprawdź Docker Desktop i nie przechodź do buildu.

W Terminalu 1 albo w nowym terminalu wykonaj kontrole jakości:

```bash
cd /Users/mateuszpindara/Projects/ChainTrack
npm run lint
npx astro check
npm run wrangler:types
```

Następnie zbuduj aplikację:

```bash
npm run build
```

Build musi zostać wykonany po każdej zmianie `.dev.vars`. Astro pobiera `SUPABASE_URL` i `SUPABASE_KEY` przez `astro:env/server` podczas budowania artefaktu.

W Terminalu 2 uruchom preview:

```bash
cd /Users/mateuszpindara/Projects/ChainTrack
npm run preview
```

Pozostaw ten terminal uruchomiony. Preview powinien działać pod `http://localhost:4321`.

W Terminalu 3 uruchom smoke test:

```bash
cd /Users/mateuszpindara/Projects/ChainTrack
BASE_URL=http://localhost:4321 npm run smoke
```

## Kryterium sukcesu

Smoke test musi zakończyć się komunikatem:

```text
All smoke steps passed
```

Oczekiwanych jest 8 kroków `PASS`:

1. strona główna odpowiada kodem `200`,
2. anonimowy `/dashboard` przekierowuje do `/auth/signin`,
3. signup tworzy konto i przekierowuje do `/auth/confirm-email`,
4. błędne hasło jest odrzucone,
5. poprawne hasło loguje użytkownika,
6. zalogowany użytkownik widzi `/dashboard`,
7. signout kończy sesję,
8. `/dashboard` po signout ponownie przekierowuje do `/auth/signin`.

## Diagnostyka

### `Supabase is not configured`

Sprawdź, czy `.dev.vars` istnieje i zawiera dokładnie `SUPABASE_URL` oraz `SUPABASE_KEY`. Następnie uruchom ponownie `npm run build` i `npm run preview`. Sam restart preview bez buildu może używać starego artefaktu `dist/`.

### `email rate limit exceeded`

Nie ponawiaj wielokrotnie testu przeciwko zewnętrznemu projektowi Supabase. Sprawdź, czy `.dev.vars` wskazuje na lokalny adres `http://127.0.0.1:54321`, przebuduj aplikację i uruchom test ponownie. Jeżeli lokalny limit auth pozostał po wcześniejszych próbach, wykonaj:

```bash
npx supabase stop
npx supabase start
npm run build
```

Następnie uruchom ponownie preview i smoke test.

### Port `4321` jest zajęty

Sprawdź istniejący preview:

```bash
npx astro preview status
```

Zatrzymaj go przed ponownym startem:

```bash
npx astro preview stop
```

Nie uruchamiaj kilku preview na tym samym porcie.

### Smoke test zwraca `ECONNREFUSED`

Preview nie działa albo użyto innego portu. Uruchom `npm run preview`, sprawdź adres i ustaw `BASE_URL` na właściwy adres.

### `npx supabase start` nie działa

Uruchom Docker Desktop, odczekaj na gotowość silnika i ponów polecenie. Nie zastępuj lokalnego Supabase zewnętrznym projektem tylko po to, aby ominąć problem startowy.

## Zatrzymanie środowiska

Po zakończeniu pracy zatrzymaj preview:

```bash
npx astro preview stop
```

Supabase można pozostawić uruchomiony między sesjami albo zatrzymać, aby zwolnić zasoby:

```bash
npx supabase stop
```

Nie usuwaj `.dev.vars`, `.wrangler/`, `dist/` ani danych lokalnego Supabase bez wyraźnej potrzeby. Nie commituj żadnego z tych plików.

## Zasady dla agenta

- Wykonuj polecenia z katalogu projektu.
- Czytaj `.dev.vars` tylko po nazwach kluczy, nigdy nie wypisuj wartości.
- Nie używaj `service_role` w lokalnej aplikacji.
- Po zmianie sekretów zawsze buduj aplikację ponownie.
- Uruchamiaj smoke test na `npm run preview`, nie na przypadkowym serwerze developerskim.
- Nie zmieniaj kodu aplikacji ani konfiguracji wdrożeniowej tylko dlatego, że środowisko lokalne nie zostało uruchomione.
- Przy raporcie podaj status Supabase, wynik buildu, adres preview i liczbę kroków `PASS`/`FAIL`.
