---
project: ChainTrack
context_type: greenfield
created: 2026-09-16
updated: 2026-09-16
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: pain category
      decision: "Brak wiarygodnej informacji o stanie łańcucha"
    - topic: primary persona scope
      decision: "Tylko właściciel wielu rowerów jako pojedynczy użytkownik"
    - topic: activities without a clearly assigned bike
      decision: "Nie importować takich aktywności ani nie doliczać ich do przebiegu; pokazać użytkownikowi informację o pominięciu"
    - topic: average interval with fewer than two completed periods
      decision: "Użytkownik może ustawić tymczasowy próg kilometrów; po zebraniu dwóch okresów aplikacja przechodzi na średni interwał"
    - topic: chain lifecycle and reattachment
      decision: "Zatrzymanie przenosi bieżący przebieg do całkowitego i zeruje bieżący; ponownie przypięty łańcuch zachowuje całkowity przebieg, ale zaczyna bieżący od zera"
    - topic: initial activity data and synchronization scope
      decision: "Pierwsza synchronizacja pobiera listę rowerów i całą dostępną historię aktywności z identyfikatorem, dystansem i przypisanym rowerem; kolejne ręczne synchronizacje pobierają tylko nowe aktywności"
  frs_drafted: 8
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-12-06
  after_hours_only: false
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
---

## Vision & Problem Statement

Właściciel wielu rowerów ma trudność z pamiętaniem, ile kilometrów przejechał
na danym łańcuchu od ostatniego woskowania. Obecnie ocenia stan łańcucha po
hałasie, przez co może zauważyć problem dopiero podczas długiej jazdy. Pogarsza
to doświadczenie z jazdy i może zwiększać zużycie napędu rowerowego.

Aplikacja ma obliczać dokładny przebieg między woskowaniami. Dzięki znajomości
przebiegu, przy którym pojawia się hałas, użytkownik chce poznać własny próg
woskowania i przewidywać termin kolejnego woskowania, zanim łańcuch zacznie
hałasować.

Przy większej skali mogą występować różne modele zachowań użytkowników, na
przykład jazda amatorska i profesjonalna oraz różne typy rowerów, co może
wymagać odmiennych progów.

## User & Persona

### Primary persona

Właściciel wielu rowerów, który samodzielnie dba o ich napęd i chce śledzić
przebieg łańcuchów bez polegania wyłącznie na odczuciach podczas jazdy.

## Access Control

Użytkownik uzyskuje dostęp przez logowanie e-mailem i hasłem. MVP ma jeden
płaski typ użytkownika: zalogowany użytkownik widzi i modyfikuje wyłącznie
własne rowery, łańcuchy, woskowania i dane z aktywności. Role administratora
nie są częścią MVP.

## Success Criteria

### Primary

- Użytkownik loguje się, łączy ze Stravą, pobiera aktywności z przypisanym
  rowerem, przegląda je od najnowszej do najstarszej, tworzy łańcuch i przypisuje
  go do aktywności.

### Secondary

- Użytkownik może oznaczyć, że na końcu aktywności wykonano woskowanie, oraz
  filtrować aktywności po rowerze lub łańcuchu.

### Guardrails

- Ponowna synchronizacja nie tworzy duplikatów aktywności.

## Timeline Budget

Pierwszy milestone ma roboczy cel 3 tygodni przy około 8 godzinach pracy
tygodniowo. Metryki łańcucha — liczba woskowań, średni przebieg i bieżący
przebieg od ostatniego woskowania — są poza pierwszym milestone'em.

## Functional Requirements

### Authentication and integration

- FR-001: Użytkownik może zalogować się do aplikacji. Priority: must-have
  > Socrates: Rozważono argument, że aplikacja mogłaby działać tylko dla jednego użytkownika bez logowania. Pozostaje w MVP, ponieważ brak logowania utrudniłby ochronę danych użytkownika.
- FR-002: Użytkownik może pobrać dane ze Stravy. Priority: must-have
  > Socrates: Nie zidentyfikowano kontrargumentu, który uzasadniałby usunięcie wymagania. Pozostaje bez zmian.
- FR-003: Użytkownik może ręcznie uruchomić aktualizację danych ze Stravy. Priority: must-have
  > Socrates: Rozważono ryzyko duplikatów i niejasnej informacji o wyniku aktualizacji. Wymaganie pozostaje, ale aktualizacja musi jasno wskazywać wynik i nie powielać aktywności.

### Activity and chain tracking

- FR-004: Użytkownik może utworzyć łańcuch. Priority: must-have
  > Socrates: Rozważono użycie jednego domyślnego łańcucha bez tworzenia go przez użytkownika. Pozostaje w MVP, ponieważ aplikacja ma śledzić osobne łańcuchy.
- FR-005: Użytkownik może przypisać łańcuch do aktywności. Priority: must-have
  > Socrates: Rozważono pracochłonność ręcznego przypisywania każdej aktywności. Pozostaje w MVP, ponieważ ręczne przypisanie jest nową uzgodnioną logiką śledzenia.
- FR-006: Użytkownik może oznaczyć, że na końcu aktywności wykonano woskowanie. Priority: must-have
  > Socrates: Rozważono rejestrowanie woskowania w osobnym miejscu oraz fakt, że oznaczenie nie jest potrzebne do samego importu. Pozostaje w MVP, ponieważ woskowanie ma być powiązane z aktywnością.
- FR-007: Użytkownik może filtrować aktywności po rowerze. Priority: must-have
  > Socrates: Rozważono ograniczenie widoku do jednego roweru bez osobnego filtra. Pozostaje w MVP, ponieważ użytkownik ma wiele rowerów.
- FR-008: Użytkownik może filtrować aktywności po łańcuchu. Priority: must-have
  > Socrates: Rozważono odłożenie filtra do czasu dodania metryk łańcucha. Pozostaje w MVP, ponieważ filtrowanie ma wspierać ręczne przypisywanie aktywności.

## User Stories

### US-01: Użytkownik przypisuje łańcuchy do aktywności

- **Given** zalogowany użytkownik ma pobrane ze Stravy aktywności przypisane do jego rowerów
- **When** przegląda listę aktywności, przypisuje łańcuch do aktywności i oznacza woskowanie
- **Then** widzi zapisane przypisanie łańcucha i informację o woskowaniu przy właściwej aktywności

#### Acceptance Criteria

- Lista pokazuje aktywności użytkownika od najnowszej do najstarszej.
- Aktywność zawiera nazwę, długość, datę i przypisany rower.
- Użytkownik może przypisać łańcuch do aktywności i oznaczyć wykonane woskowanie.
- Ponowna synchronizacja nie tworzy duplikatów aktywności.

## Business Logic

Aplikacja wylicza średni przebieg łańcucha między woskowaniami.

Użytkownik wskazuje, który łańcuch był używany w aktywności i przy której
aktywności wykonano woskowanie. Aplikacja pokazuje, ile kilometrów minęło od
ostatniego woskowania, aby użytkownik mógł oszacować termin kolejnego.

## Non-Functional Requirements

- Użytkownik widzi wyłącznie własne aktywności, rowery i łańcuchy.
- Ponowna synchronizacja nie tworzy duplikatów aktywności.
- Jeśli synchronizacja się nie powiedzie, aplikacja informuje o tym użytkownika
  i nie tworzy pozornej aktualizacji.

## Non-Goals

- MVP nie będzie automatycznie przypisywać łańcucha do aktywności; użytkownik
  przypisuje go ręcznie.
- MVP nie będzie jeszcze pokazywać metryk łańcucha: liczby woskowań, średniego
  przebiegu i bieżącego przebiegu.
- MVP nie będzie synchronizować aktywności w tle; aktualizacja jest uruchamiana
  ręcznie.
- MVP nie będzie obsługiwać wielu użytkowników ani ról administratora.

## Quality cross-check

- Access Control: present — logowanie e-mailem i hasłem oraz izolacja danych użytkownika.
- Business Logic: present — reguła obliczania średniego przebiegu łańcucha między woskowaniami.
- Project artifacts: present — shape-notes.md ma poprawny checkpoint.
- Timeline-cost acknowledgment: present — pierwszy milestone ma cel 3 tygodni.
- Non-Goals: present — cztery wyłączenia zakresu zostały zapisane.

## Resolved Open Questions

1. **Aktywności bez jednoznacznie przypisanego roweru:** nie są importowane ani
   doliczane do przebiegu. Użytkownik widzi krótką informację o ich pominięciu.
2. **Średni interwał przy mniej niż dwóch zakończonych okresach:** użytkownik
   może ustawić tymczasowy próg kilometrów. Aplikacja używa go do pokazania
   pozostałego przebiegu, a po zebraniu dwóch okresów przechodzi na średni
   interwał.
3. **Zakończenie używania i ponowne przypięcie łańcucha:** zatrzymanie przenosi
   bieżący przebieg do całkowitego, zeruje bieżący i oznacza łańcuch jako
   nieaktywny. Nowy lub ponownie przypięty łańcuch zaczyna bieżący przebieg od
   zera; ponownie użyty zachowuje przebieg całkowity. Nowe aktywności są
   doliczane wyłącznie do aktualnie aktywnego łańcucha.
4. **Zakres danych i synchronizacji:** pierwsze wdrożenie pobiera listę rowerów
   oraz aktywności z identyfikatorem, dystansem i przypisanym rowerem. Pierwsza
   synchronizacja pobiera całą dostępną historię, a kolejne ręczne
   synchronizacje tylko nowe aktywności od ostatniej aktualizacji.
