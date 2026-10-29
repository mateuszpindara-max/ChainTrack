# Produkcyjny status Stravy — skrót planu

> Pełny plan: `context/changes/production-strava-status/plan.md`
> Frame Brief: `context/changes/production-strava-status/frame.md`

## What & Why

> **The actual problem to plan around is**: identify why the authenticated production dashboard cannot successfully read the user's Strava connection record from its configured Supabase project.

Dashboard zgłasza `Connection status unavailable`, a połączenie Stravy nie powiodło się. Plan najpierw ustala dokładny błąd odczytu i tożsamość środowiska, zamiast zakładać, że przyczyną są sekrety Stravy albo brak migracji.

## Starting Point

Dashboard rozróżnia błąd odczytu `strava_connections` od udanego odczytu bez rekordu: pierwszy daje `Connection status unavailable`, drugi `Not connected`. Schemat i RLS są w migracjach repozytorium, ale stan produkcyjny nie jest znany; ponadto lokalny `supabase/config.toml` wciąż wskazuje `10x-astro-starter`.

## Desired End State

Dashboard pokazuje stan wynikający z rzeczywistego odczytu połączenia. Potwierdzona przyczyna jest naprawiona wyłącznie w wymaganym zakresie, a OAuth Stravy jest sprawdzany oddzielnie. Właściciel otrzymuje bezpieczną, polską instrukcję diagnozy w istniejącym deployment runbooku.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Kryterium zakończenia | Naprawić odczyt statusu; OAuth sprawdzić osobno, jeśli nadal zawodzi | Trzyma diagnozę przy potwierdzonym objawie i nie utożsamia go z brakiem autoryzacji Stravy | Plan |
| Źródło dowodów | Istniejące panele Cloudflare i Supabase | Pozwala sprawdzić środowisko bez dodawania logowania do kodu | Plan |
| Zakres zmian produkcyjnych | Wyłącznie minimalna, potwierdzona naprawa; osobna zgoda przed operacją | Zmiana sekretów, migracje, RLS i deploy są obarczone ryzykiem i już wymagają ręcznej akceptacji | Frame / deployment runbook |
| Dokumentacja | Dodać sekcję do istniejącego polskiego runbooka | Zachowuje jedno miejsce dla procedur produkcyjnych | Plan |
| Niezaufana konfiguracja lokalna | Nie linkować CLI do produkcji na podstawie obecnego `project_id` | `supabase/config.toml` ma nadal szablonową wartość `10x-astro-starter` | Plan |

## Scope

**W zakresie:** bezpieczne ustalenie tożsamości Workera/projektu, przegląd zanonimizowanych logów, kontrola stanu migracji/schematu/RLS, jedna warunkowa naprawa, weryfikacja statusu oraz runbook.

**Poza zakresem:** redesign UI, funkcje Chains i Bikes, rotacja sekretów na próbę, aplikacyjne logowanie/telemetria, niezatwierdzone migracje/deploy/rollback i zmiana klucza `service_role`.

## Architecture / Approach

Najpierw odczyt tylko w panelach dostawców i zanonimizowanie dowodów. Następnie naprawa wyłącznie tej warstwy, którą wskazuje konkretny błąd. Po potwierdzeniu rozróżnienia `unavailable` / `not-connected` / `connected`, osobno sprawdzić OAuth i utrwalić procedurę w runbooku.

## Phases at a Glance

| Faza | Rezultat | Główne ryzyko |
| --- | --- | --- |
| 1. Zbierz dowody bez zmian | Potwierdzony projekt, błąd, stan migracji i zakres objawu | Dostęp do paneli/logów może być niewystarczający |
| 2. Napraw potwierdzoną przyczynę | Jedna minimalna i zatwierdzona zmiana albo jawna blokada | Niepoprawny cel produkcyjny lub niezamierzona zmiana danych |
| 3. Potwierdź przepływ i runbook | Prawidłowy status, oddzielny wynik OAuth i instrukcja po polsku | OAuth może mieć niezależny problem po naprawie odczytu |

**Wymagania wstępne:** właściciel ma dostęp do paneli Cloudflare i Supabase oraz może potwierdzić niesekretne nazwy/identyfikatory; każda produkcyjna zmiana nadal wymaga osobnej zgody. Nie należy przekazywać agentowi sekretów.

**Szacowany wysiłek:** około 1–2 wspólnych sesji diagnostycznych; czas naprawy zależy od błędu i dostępu do dostawców.

## Open Risks & Assumptions

- Przyczyna produkcyjna nie jest jeszcze znana; sama nazwa komunikatu wskazuje ścieżkę odczytu, nie źródłowy błąd dostawcy.
- Jeśli nie da się uzyskać logów lub historii migracji, plan zatrzymuje się z konkretną blokadą zamiast zgadywać i zmieniać produkcję.
- Lokalne `project_id = "10x-astro-starter"` nie może być użyte jako dowód ani cel dla operacji produkcyjnej.

## Success Criteria (Summary)

- Zalogowany dashboard pokazuje poprawny stan, a brak rekordu nie jest mylony z błędem odczytu.
- Każda zmiana produkcyjna wynika z dowodu, jest minimalna i osobno zatwierdzona.
- Istniejący runbook pozwala powtórzyć diagnostykę bez ujawniania sekretów ani wykonywania niezatwierdzonych operacji.