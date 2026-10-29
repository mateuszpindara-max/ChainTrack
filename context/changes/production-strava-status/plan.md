# Diagnoza niedostępnego statusu Stravy na produkcji — Plan implementacji

## Overview

Ustalić i naprawić przyczynę, dla której zalogowany dashboard produkcyjny nie może odczytać rekordu `strava_connections` z skonfigurowanego projektu Supabase. Plan prowadzi od bezpiecznego zebrania dowodów w panelach dostawców do minimalnej, potwierdzonej naprawy, a następnie aktualizuje istniejący runbook.

## Current State Analysis

- `src/pages/dashboard.astro` ustawia `connectionStatus` na `unavailable`, jeśli odczyt `strava_connections` kończy się błędem. Udany odczyt bez rekordu daje `not-connected`; dopiero udany odczyt rekordu ustawia `connected`.
- `src/components/ActivityDashboard.tsx` renderuje stan `unavailable` jako `Connection status unavailable`.
- `src/lib/supabase.ts` tworzy klienta SSR na podstawie serwerowych `SUPABASE_URL` i `SUPABASE_KEY`. Middleware rozwiązuje użytkownika z sesji i chroni dashboard.
- Migracja `20261009000000_create_activity_import_schema.sql` tworzy `strava_connections`, RLS i politykę własności użytkownika. Kolejne migracje dodają kolumny importu i tabele przebiegów synchronizacji. Repozytorium nie potwierdza, które migracje są zastosowane w produkcji.
- `wrangler.jsonc` wskazuje Worker `chaintrack-production`, ale nie potwierdza, do jakiego projektu Supabase kierują produkcyjne sekrety.
- `supabase/config.toml` nadal ma `project_id = "10x-astro-starter"`. Nie wolno zakładać, że lokalny Supabase CLI jest powiązany z właściwym projektem produkcyjnym.
- Błąd OAuth Stravy jest oddzielnym etapem. Brak rekordu po udanym odczycie powinien dać `Not connected`; nie wyjaśnia sam w sobie etykiety `Connection status unavailable`.
- Istniejący runbook wymaga ręcznej zgody właściciela na zmiany produkcyjne, sekrety i migracje. Te bramki pozostają obowiązujące.

## Desired End State

Dashboard produkcyjny po zalogowaniu może odczytać stan połączenia i pokazuje `Not connected` albo `Connected` zgodnie z rzeczywistym stanem rekordu. Każda niezbędna zmiana wynika z konkretnego, zanonimizowanego błędu i jest ograniczona do potwierdzonej przyczyny. Istniejący polski runbook prowadzi użytkownika przez bezpieczne kontrole, warunkowe naprawy i osobną weryfikację OAuth.

### Key Discoveries:

- Gałąź `connectionError` w `src/pages/dashboard.astro` bezpośrednio prowadzi do etykiety `Connection status unavailable`.
- Odczyt aktywnego przebiegu jest obsługiwany osobno; endpoint `/api/strava/sync` ma odrębny błąd `Could not check saved synchronization progress`.
- `SUPABASE_URL` i `SUPABASE_KEY` są serwerowe; ich wartości, tokeny, cookies i pełne payloady nie mogą być ujawniane w rozmowie ani dokumentacji.
- Produkcyjna historia migracji oraz ustawienia Worker/Supabase nie są dostępne w repozytorium i wymagają sprawdzenia przez właściciela w panelach.
- Frame Brief klasyfikuje przyczynę odczytu jako nieznaną; status aplikacji, dane biznesowe i OAuth należy diagnozować oddzielnie.

## What We're NOT Doing

- Nie zmieniamy kolorystyki ani widoku listy aktywności.
- Nie wdrażamy zmian Chains ani Bikes.
- Nie obracamy ani nie podmieniamy sekretów „na próbę”.
- Nie stosujemy migracji, zmian RLS, deployu ani rollbacku bez wskazania konkretnej przyczyny i wymaganej osobnej zgody.
- Nie używamy klucza `service_role`, nie łączymy lokalnego CLI z produkcją na podstawie domysłów i nie wykonujemy `db reset` na zdalnym projekcie.
- Nie dodajemy do kodu telemetrii/logowania wyłącznie po to, by diagnozować zgłoszony przypadek; uzgodnionym źródłem dowodów są istniejące panele Cloudflare i Supabase.
- Nie traktujemy naprawy OAuth jako substytutu naprawy błędu odczytu dashboardu. OAuth sprawdzamy osobno tylko wtedy, gdy nadal zawodzi po rozstrzygnięciu stanu bazy.

## Implementation Approach

Najpierw właściciel potwierdza niesekretną tożsamość publicznego Workera i projektu Supabase oraz odczytuje stan dashboardu, logi i historię migracji w panelach dostawców. Na podstawie konkretnego błędu klasyfikujemy problem jako konfigurację/projekt, brakujący schemat lub RLS, błąd sesji/uprawnień albo problem przejściowy. Wprowadzamy wyłącznie odpowiadającą mu, najmniejszą naprawę; operacje zmieniające produkcję zatrzymują się na istniejącej bramce zatwierdzenia. Po zmianie sprawdzamy odczyt statusu i, jeśli potrzeba, osobno autoryzację Stravy. Na końcu zapisujemy ścieżkę diagnostyczną w runbooku bez sekretów.

## Phase 1: Zbierz dowody produkcyjne bez zmian

### Overview

Ustalić, czy problem dotyczy połączenia Worker–Supabase, projektu/schematu/RLS, sesji użytkownika, czy osobnego przepływu OAuth. Ta faza jest tylko odczytowa i nie wymaga wdrożenia ani modyfikacji bazy.

### Changes Required:

#### 1. Potwierdź tożsamość środowisk i zakres objawu

**File**: `context/changes/deployment/deployment-plan.md`, `wrangler.jsonc`, `supabase/config.toml`

**Intent**: Użyć nazw Workera i projektu Supabase jako niesekretnego punktu odniesienia oraz zauważyć rozbieżność lokalnego `project_id` z nazwą produkcyjną.

**Contract**: W Cloudflare Dashboard sprawdzić nazwę i publiczny host Workera `chaintrack-production`; w Supabase Dashboard sprawdzić nazwę projektu i project ref. Porównać je z Workerem/konfiguracją, nie ujawniając URL-a zawierającego dane wrażliwe, kluczy, tokenów ani cookies. Nie uruchamiać poleceń CLI, które linkują lub modyfikują zdalny projekt.

#### 2. Zbierz bezpieczne sygnały z dashboardu i paneli

**File**: `src/pages/dashboard.astro`, `src/components/ActivityDashboard.tsx`, `context/changes/deployment/deployment-plan.md`

**Intent**: Rozróżnić błąd odczytu połączenia od problemów pobierania rowerów/łańcuchów, błędu aktywnego sync-run i nieudanego callbacku OAuth.

**Contract**: Na zalogowanym koncie sprawdzić, które sekcje dashboardu są dostępne i zanotować dokładny tekst/kod błędu z Cloudflare Worker Logs oraz Supabase Logs. Zapisać tylko czas, nazwę środowiska, kod/status i zanonimizowany komunikat błędu; usunąć identyfikatory użytkownika, nagłówki, cookies, tokeny, query stringi z OAuth i payloady.

#### 3. Zweryfikuj migracje i dostęp do rekordu bez zapisu

**File**: `supabase/migrations/20261009000000_create_activity_import_schema.sql`, późniejsze migracje `supabase/migrations/`, `supabase/tests/database/strava_rls.test.sql`

**Intent**: Porównać oczekiwany schemat/politykę z historią produkcyjnego projektu, aby nie zakładać ani nie stosować migracji w ciemno.

**Contract**: W Supabase Dashboard sprawdzić tabelę historii migracji i obecność tabeli/kolumny `public.strava_connections` oraz polityki RLS dopuszczającej zalogowanemu użytkownikowi odczyt własnego rekordu. Nie wykonywać DDL/DML, `db push`, `db reset` ani zmian RLS w tej fazie. Brak czytelnej historii lub brak uprawnień zapisać jako blokadę, nie jako dowód, że migracje nie istnieją.

### Success Criteria:

#### Manual Verification:

- Właściciel potwierdza w panelach, że diagnozowany Worker i projekt Supabase są właściwym środowiskiem produkcyjnym.
- Zebrano dokładny, zanonimizowany status/błąd odczytu `strava_connections` i ustalono, czy błędne są też odczyty rowerów lub łańcuchów.
- Zapisano status wymaganych migracji, schematu i polityki RLS wyłącznie na podstawie widocznych danych; niczego nie zmieniono.
- Wyniki pozwalają przypisać następny krok do konkretnej kategorii albo jasno wskazują brak dostępu/dowodów wymagający eskalacji.

**Implementation Note**: Zatrzymać się po tej fazie i wspólnie zatwierdzić diagnozę oraz konkretny zakres naprawy. Nie przechodzić do zmiany produkcji wyłącznie na podstawie przypuszczeń.

## Phase 2: Napraw potwierdzoną przyczynę

### Overview

Wykonać wyłącznie najmniejszą naprawę wskazaną przez dowody z Phase 1. Nieznana lub wieloznaczna przyczyna pozostaje blokadą; nie wykonujemy wtedy rotacji sekretów ani migracji próbnych.

### Changes Required:

#### 1. Zastosuj jedną, uzasadnioną naprawę środowiska lub bazy

**File**: `context/changes/deployment/deployment-plan.md`, odpowiednie ustawienia w Cloudflare/Supabase; ewentualnie brakująca migracja w `supabase/migrations/`

**Intent**: Skorygować dokładnie zidentyfikowaną rozbieżność między Workerem a projektem/bazą albo zastosować brakującą, już zatwierdzoną migrację.

**Contract**: Jeśli Worker wskazuje niewłaściwy projekt, właściciel aktualizuje wyłącznie potwierdzoną wartość środowiskową w panelu Cloudflare, nie w repozytorium ani rozmowie. Jeśli brakuje migracji, przed zastosowaniem sprawdzić właściwy project ref, listę brakujących wersji i treść zatwierdzonego pliku migracji; uzyskać osobną zgodę właściciela i użyć uzgodnionej ścieżki migracji. Jeśli błąd dotyczy RLS, zmieniać tylko potwierdzoną politykę i zachować izolację danych per user. Nie wprowadzać `service_role` do aplikacji.

#### 2. Popraw kod tylko w przypadku dowodu usterki kodu

**File**: `src/pages/dashboard.astro` lub wąski, wskazany przez dowód moduł; odpowiadający mu test

**Intent**: Naprawić błąd aplikacyjny wyłącznie wtedy, gdy logi i kontrola projektu potwierdzą, że poprawna baza, sesja i konfiguracja nadal prowadzą do nieprawidłowego zapytania/obsługi błędu.

**Contract**: Zachować rozróżnienie `unavailable` (odczyt zakończony błędem), `not-connected` (udany odczyt bez wiersza) i `connected` (wiersz odczytany). Nie dodawać szczegółów wewnętrznych ani danych wrażliwych do UI. Dodać lub zaktualizować wąski test dla konkretnego przypadku przed zmianą kodu.

### Success Criteria:

#### Automated Verification:

- Jeśli zmieniono kod: właściwy test jednostkowy/regresyjny przechodzi oraz `npm run check` i `npm run lint` przechodzą.
- Jeśli zmieniono migrację: `npx supabase db reset` na lokalnej bazie odtwarza wszystkie migracje, a `npm run test` przechodzi; żadna z tych komend nie może wskazywać na produkcję.
- Zmiany w repozytorium nie zawierają wartości sekretów, project ref w miejscu wymagającym tajemnicy, tokenów, cookies ani klucza `service_role`.

#### Manual Verification:

- Właściciel zatwierdza oddzielnie każdą zmianę produkcyjnego sekretu, konfiguracji, schematu/RLS lub deployu przed jej wykonaniem.
- Naprawa odpowiada bezpośrednio zanonimizowanemu błędowi; nie zmieniono niezwiązanych sekretów, tabel ani polityk.
- Po zatwierdzonej zmianie dashboard jest sprawdzony na właściwym koncie produkcyjnym, a stan odczytu odnotowany bez danych wrażliwych.

**Implementation Note**: Jeżeli Phase 1 nie wskazuje jednej wiarygodnej przyczyny, ta faza nie wykonuje zmian. Wymaga uzupełnienia dowodów lub pomocy administratora dostawcy.

## Phase 3: Potwierdź przepływ i utrwal runbook

### Overview

Potwierdzić rezultat w UI, oddzielić ewentualny problem OAuth od odczytu bazy i uzupełnić polski deployment runbook o powtarzalną, bezpieczną procedurę.

### Changes Required:

#### 1. Zweryfikuj status i w razie potrzeby OAuth

**File**: `src/pages/dashboard.astro`, `src/pages/api/strava/connect.ts`, `src/pages/api/strava/callback.ts`, `src/lib/strava/security.ts`

**Intent**: Sprawdzić najpierw, czy status połączenia odzwierciedla wynik odczytu; dopiero gdy dashboard poprawnie pokazuje `Not connected`, diagnozować osobno nieudany OAuth.

**Contract**: Po poprawnym odczycie bez rekordu oczekiwany jest stan `Not connected`; po autoryzacji zakończonej zapisem rekordu oczekiwany jest `Connected`. Jeśli OAuth nadal nie działa, użyć dokładnego zanonimizowanego wyniku connect/callback, sprawdzić host/redirect URI oraz wymagane scope'y `activity:read_all` i `profile:read_all`. Nie logować ani nie udostępniać `code`, `state`, tokenów lub pełnego URL callbacku.

#### 2. Dodaj przewodnik do istniejącego deployment runbooka

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Umieścić utrzymywalną instrukcję dla właściciela obok istniejących etapów produkcyjnych, zamiast tworzyć drugi, konkurencyjny runbook.

**Contract**: Dodać polską sekcję dla `Connection status unavailable`, zawierającą kolejność rozpoznania właściwego Workera/projektu, odczytu statusu dashboardu, przeglądu zanonimizowanych logów, sprawdzenia historii migracji/RLS, warunkowej naprawy z bramką zgody oraz osobnej kontroli OAuth. Wyraźnie ostrzec o lokalnym `project_id = "10x-astro-starter"`, zakazać działań CLI na produkcji bez jawnego potwierdzenia projektu i zabronić kopiowania sekretów, tokenów, cookies oraz danych użytkownika. Nie utrwalać żadnych prawdziwych wartości konfiguracyjnych.

### Success Criteria:

#### Automated Verification:

- Jeśli zmieniono kod: `npm run test`, `npm run check` i `npm run lint` przechodzą.
- Dokumentacja nie zawiera sekretów ani nie sugeruje `service_role`, niezatwierdzonego deployu, zdalnego `db reset` ani użycia lokalnego projektu jako produkcyjnego.
- `git diff --check` przechodzi.

#### Manual Verification:

- Zalogowany użytkownik widzi prawidłowy status połączenia; brak rekordu nie jest mylony z błędem odczytu.
- Jeśli OAuth był objęty problemem, autoryzacja Stravy kończy się powrotem do właściwego hosta, wymaganymi scope'ami i zapisanym połączeniem; początkowy import jest sprawdzany tylko wtedy, gdy to połączenie działa.
- Właściciel może przejść nową sekcję runbooka bez wklejania sekretów do rozmowy i bez wykonania niezatwierdzonej operacji produkcyjnej.

## Testing Strategy

### Unit Tests:

- Tylko jeśli dowody uzasadnią zmianę kodu: pokryć dokładnie rozpoznaną gałąź odczytu i zachować trzy rozróżnienia statusu (`unavailable`, `not-connected`, `connected`).
- Jeśli zmieniana jest istniejąca logika OAuth, rozszerzyć odpowiedni test o konkretny, potwierdzony błąd konfiguracji/redirectu/scope'ów; nie mockować ani nie logować rzeczywistych sekretów.

### Integration Tests:

- Dla zmiany migracji: odtworzyć pełny lokalny zestaw migracji i uruchomić testy RLS; nie łączyć lokalnych testów z projektem produkcyjnym.
- Po zatwierdzonej naprawie środowiska wykonać ręczny odczyt przez prawdziwą sesję użytkownika na produkcji; nie wykonywać testowego zapisu do danych użytkownika.

### Manual Testing Steps:

1. Zalogować się do właściwego hosta produkcyjnego i zapisać, czy rowery/łańcuchy się ładują oraz jaki status Stravy jest wyświetlany.
2. Sprawdzić zanonimizowane logi Worker/Supabase dla tego żądania i zestawić je z potwierdzoną tożsamością projektu oraz historią migracji.
3. Po zaakceptowanej naprawie odświeżyć dashboard i potwierdzić oczekiwany stan; osobno przejść OAuth i import tylko wtedy, gdy nadal są niesprawne.

## Performance Considerations

Plan nie wprowadza cyklicznego odpytywania, nowych zapytań ani dodatkowej telemetrii. Brak nowego budżetu wydajnościowego; ewentualna zmiana kodu musi pozostać lokalna dla potwierdzonego błędu.

## Migration Notes

- Nie stosować migracji, dopóki nie zostanie potwierdzone, że brakuje konkretnej wersji w właściwym projekcie produkcyjnym.
- Nie używać `npx supabase db reset` na produkcji. Lokalny reset jest dopuszczalny wyłącznie do walidacji migracji na lokalnej bazie.
- `supabase/config.toml` ma szablonowy `project_id`; każde użycie CLI wobec zdalnego projektu wymaga uprzedniego, jawnego potwierdzenia właściwego project ref, planu zmian i osobnej zgody właściciela.
- Zmianę schematu/RLS i deploy traktować oddzielnie; przed nimi sprawdzić kompatybilność oraz uzyskać zgodę zgodnie z deployment runbookiem. Nie cofać migracji automatycznie.

## References

- Frame Brief: `context/changes/production-strava-status/frame.md`
- Deployment runbook: `context/changes/deployment/deployment-plan.md`
- Dashboard status read: `src/pages/dashboard.astro`; display: `src/components/ActivityDashboard.tsx`
- Supabase SSR client and server-only configuration: `src/lib/supabase.ts`, `astro.config.mjs`
- Base schema/RLS: `supabase/migrations/20261009000000_create_activity_import_schema.sql`
- Sync-run schema: `supabase/migrations/20261016120000_add_strava_sync_runs.sql`
- OAuth endpoints and validation: `src/pages/api/strava/connect.ts`, `src/pages/api/strava/callback.ts`, `src/lib/strava/security.ts`
- Database RLS tests: `supabase/tests/database/strava_rls.test.sql`
- Local Supabase project identifier: `supabase/config.toml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Zbierz dowody produkcyjne bez zmian

#### Manual

- [x] 1.1 Właściciel potwierdza w panelach, że diagnozowany Worker i projekt Supabase są właściwym środowiskiem produkcyjnym. — 9adc6e1
- [x] 1.2 Zebrano dokładny, zanonimizowany status/błąd odczytu `strava_connections` i ustalono, czy błędne są też odczyty rowerów lub łańcuchów. — 9adc6e1
- [x] 1.3 Zapisano status wymaganych migracji, schematu i polityki RLS wyłącznie na podstawie widocznych danych; niczego nie zmieniono. — 9adc6e1
- [x] 1.4 Wyniki pozwalają przypisać następny krok do konkretnej kategorii albo jasno wskazują brak dostępu/dowodów wymagający eskalacji. — 9adc6e1

### Phase 2: Napraw potwierdzoną przyczynę

#### Automated

- [x] 2.1 Jeśli zmieniono kod: właściwy test jednostkowy/regresyjny przechodzi oraz `npm run check` i `npm run lint` przechodzą.
- [x] 2.2 Jeśli zmieniono migrację: `npx supabase db reset` na lokalnej bazie odtwarza wszystkie migracje, a `npm run test` przechodzi; żadna z tych komend nie może wskazywać na produkcję.
- [x] 2.3 Zmiany w repozytorium nie zawierają wartości sekretów, project ref w miejscu wymagającym tajemnicy, tokenów, cookies ani klucza `service_role`.

#### Manual

- [x] 2.4 Właściciel zatwierdza oddzielnie każdą zmianę produkcyjnego sekretu, konfiguracji, schematu/RLS lub deployu przed jej wykonaniem.
- [x] 2.5 Naprawa odpowiada bezpośrednio zanonimizowanemu błędowi; nie zmieniono niezwiązanych sekretów, tabel ani polityk.
- [x] 2.6 Po zatwierdzonej zmianie dashboard jest sprawdzony na właściwym koncie produkcyjnym, a stan odczytu odnotowany bez danych wrażliwych.

### Phase 3: Potwierdź przepływ i utrwal runbook

#### Automated

- [ ] 3.1 Jeśli zmieniono kod: `npm run test`, `npm run check` i `npm run lint` przechodzą.
- [ ] 3.2 Dokumentacja nie zawiera sekretów ani nie sugeruje `service_role`, niezatwierdzonego deployu, zdalnego `db reset` ani użycia lokalnego projektu jako produkcyjnego.
- [ ] 3.3 `git diff --check` przechodzi.

#### Manual

- [ ] 3.4 Zalogowany użytkownik widzi prawidłowy status połączenia; brak rekordu nie jest mylony z błędem odczytu.
- [ ] 3.5 Jeśli OAuth był objęty problemem, autoryzacja Stravy kończy się powrotem do właściwego hosta, wymaganymi scope'ami i zapisanym połączeniem; początkowy import jest sprawdzany tylko wtedy, gdy to połączenie działa.
- [ ] 3.6 Właściciel może przejść nową sekcję runbooka bez wklejania sekretów do rozmowy i bez wykonania niezatwierdzonej operacji produkcyjnej.