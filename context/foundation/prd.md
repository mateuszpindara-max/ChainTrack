---
project: ChainTrack
version: 2
status: draft
created: 2026-09-16
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-12-06
  after_hours_only: false
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

## User & Persona

### Primary persona

Właściciel wielu rowerów, który samodzielnie dba o ich napęd i chce śledzić
przebieg łańcuchów bez polegania wyłącznie na odczuciach podczas jazdy.

## Success Criteria

### Primary

- Użytkownik loguje się, pobiera aktywności z przypisanym rowerem, przegląda je
  od najnowszej do najstarszej, tworzy łańcuch i oznacza pierwszą aktywność,
  podczas której używa go po woskowaniu.

### Secondary

- Użytkownik może oznaczyć pierwszą aktywność na świeżo nawoskowanym łańcuchu
  oraz filtrować aktywności po rowerze lub łańcuchu.

### Guardrails

- Ponowna synchronizacja nie tworzy duplikatów aktywności.

## User Stories

### US-01: Użytkownik oznacza początek używania nawoskowanego łańcucha

- **Given** zalogowany użytkownik ma pobrane aktywności przypisane do jego rowerów
- **When** przegląda listę aktywności i wskazuje aktywność, która jako pierwsza używa nowo nawoskowanego łańcucha
- **Then** widzi oznaczenie tej aktywności oraz ten łańcuch przy kolejnych aktywnościach tego samego roweru aż do następnego oznaczenia

#### Acceptance Criteria

- Lista pokazuje aktywności użytkownika od najnowszej do najstarszej.
- Aktywność zawiera nazwę, długość, datę i przypisany rower.
- Użytkownik może wskazać łańcuch przy pierwszej aktywności po woskowaniu; łańcuch jest uwzględniany przy kolejnych aktywnościach tego samego roweru do następnego oznaczenia.
- Oznaczenie woskowania jest widoczne przy aktywności, która jako pierwsza używa świeżo nawoskowanego łańcucha.
- Ponowna synchronizacja nie tworzy duplikatów aktywności.

## Functional Requirements

### Authentication and integration

- FR-001: Użytkownik może zalogować się do aplikacji. Priority: must-have
  > Socrates: Rozważono argument, że aplikacja mogłaby działać tylko dla jednego użytkownika bez logowania. Pozostaje w MVP, ponieważ brak logowania utrudniłby ochronę danych użytkownika.
- FR-002: Użytkownik może pobrać dane z zewnętrznego źródła aktywności. Priority: must-have
  > Socrates: Nie zidentyfikowano kontrargumentu, który uzasadniałby usunięcie wymagania. Pozostaje bez zmian.
- FR-003: Użytkownik może ręcznie uruchomić jedną z dwóch aktualizacji danych ze Stravy: import nowo widocznych aktywności niezależnie od daty jazdy albo naprawę całej historii, która odświeża obecnie zapisywane pola i przypisania roweru. Aktywności nadal obecne w Stravie, ale bez jednoznacznego roweru, są zachowane i ukryte; aktywności usunięte w Stravie są fizycznie usuwane wraz z danymi zależnymi dopiero po pełnym, zweryfikowanym przebiegu. Priority: must-have
  > Socrates: Rozważono ryzyko duplikatów, niejasnego wyniku i usunięcia danych po niepełnym skanowaniu. Każda aktualizacja jest uruchamiana przez użytkownika, jasno wskazuje wynik i nie powiela aktywności.

### Activity and chain tracking

- FR-004: Użytkownik może utworzyć łańcuch. Priority: must-have
  > Socrates: Rozważono użycie jednego domyślnego łańcucha bez tworzenia go przez użytkownika. Pozostaje w MVP, ponieważ aplikacja ma śledzić osobne łańcuchy.
- FR-005: Użytkownik może wskazać łańcuch przy aktywności, która jako pierwsza używa go po woskowaniu; ten łańcuch jest uwzględniany przy kolejnych aktywnościach tego samego roweru aż do następnego oznaczenia lub zatrzymania używania łańcucha. Priority: must-have
  > Socrates: Rozważono ręczne przypisywanie łańcucha do każdej aktywności. Użytkownik wskazuje łańcuch raz na początku cyklu woskowania, co ogranicza powtarzalne czynności i zachowuje powiązanie z aktywnością.
- FR-006: Użytkownik może oznaczyć aktywność jako pierwszą, podczas której używa nowo nawoskowanego łańcucha. Priority: must-have
  > Socrates: Rozważono rejestrowanie woskowania poza listą aktywności. Oznaczenie pierwszej jazdy wiąże początek używania świeżo nawoskowanego łańcucha z właściwą aktywnością.
- FR-007: Użytkownik może filtrować aktywności po rowerze. Priority: must-have
  > Socrates: Rozważono ograniczenie widoku do jednego roweru bez osobnego filtra. Pozostaje w MVP, ponieważ użytkownik ma wiele rowerów.
- FR-008: Użytkownik może filtrować aktywności po łańcuchu. Priority: must-have
  > Socrates: Rozważono odłożenie filtra do czasu dodania metryk łańcucha. Pozostaje w MVP, ponieważ filtrowanie wspiera sprawdzanie i korygowanie oznaczeń cykli woskowania.
- FR-009: Użytkownik może wyświetlić historię cykli woskowania łańcucha, przebieg bieżących cykli oraz łączny przebieg łańcucha. Priority: must-have
- FR-010: Użytkownik może ustawić własny próg woskowania dla każdego łańcucha lub skorzystać z sugerowanego progu, gdy jest dostępny. Priority: must-have
- FR-011: Użytkownik widzi ostrzeżenie przy rowerze używającym łańcucha po osiągnięciu 75% progu woskowania oraz alarm po osiągnięciu 100% progu. Priority: must-have
- FR-012: Użytkownik może zatrzymać używanie łańcucha, zachowując jego dotychczasowy przebieg; późniejsze aktywności nie są do niego przypisane aż do oznaczenia pierwszej jazdy po ponownym woskowaniu. Ta jazda rozpoczyna nowy cykl i jest uwzględniana w jego przebiegu. Priority: must-have

## Non-Functional Requirements

- Użytkownik widzi wyłącznie własne aktywności, rowery i łańcuchy.
- Ponowna synchronizacja nie tworzy duplikatów aktywności.
- Jeśli synchronizacja się nie powiedzie, aplikacja informuje o tym użytkownika
  i nie tworzy pozornej aktualizacji.

## Business Logic

Użytkownik oznacza aktywność, która jako pierwsza używa nowo nawoskowanego łańcucha, a ten łańcuch obowiązuje kolejne aktywności tego samego roweru aż do następnego oznaczenia lub zatrzymania używania łańcucha.

Oznaczenie dotyczy początku używania świeżo nawoskowanego łańcucha, a nie czynności wykonanej na końcu oznaczonej aktywności. Po ukończeniu dwóch cykli aplikacja pokazuje średni przebieg ukończonych cykli wyłącznie informacyjnie; średnia nie zmienia progu woskowania.

## Access Control

Użytkownik uzyskuje dostęp przez logowanie e-mailem i hasłem. MVP ma jeden
płaski typ użytkownika: zalogowany użytkownik widzi i modyfikuje wyłącznie
własne rowery, łańcuchy, woskowania i dane z aktywności. Role administratora
nie są częścią MVP.

## Non-Goals

- MVP nie będzie automatycznie rozpoznawać, kiedy łańcuch został nawoskowany;
  użytkownik ręcznie oznacza pierwszą aktywność nowego cyklu, a łańcuch jest
  uwzględniany przy kolejnych aktywnościach tego samego roweru.
- MVP nie będzie synchronizować aktywności w tle; aktualizacja jest uruchamiana
  ręcznie.
- MVP nie będzie obsługiwać wielu użytkowników ani ról administratora.

## Open Questions

Brak otwartych pytań z przekazanego zakresu. Rozstrzygnięte decyzje dotyczące
aktywności bez jednoznacznie przypisanego roweru, progów przy krótkiej historii,
cyklu życia łańcucha oraz zakresu pierwszej i kolejnych synchronizacji pozostają
częścią uzgodnionego zakresu implementacji.
